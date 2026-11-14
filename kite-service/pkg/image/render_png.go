package image

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	_ "image/png"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "golang.org/x/image/webp"

	"github.com/fogleman/gg"
	"golang.org/x/image/font"
)

const (
	maxImageDownloadBytes = 8 * 1024 * 1024 // 8 MB max remote image size
	maxDecodedDimension   = 4096            // Max 4096x4096 decoded image
	maxImageCacheEntries  = 40
	DefaultPlaceholderPhoto = "https://cdn.discordapp.com/app-icons/1500112380464726106/dc6d484228e2e40291d539e809e392fe?size=1024"
)

var (
	httpClient = newSafeHTTPClient()

	imgCacheLock sync.RWMutex
	imgCache     = make(map[string]image.Image)
)

func isPrivateOrReservedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsPrivate() || ip.IsUnspecified() {
		return true
	}
	// Block CGNAT 100.64.0.0/10 and cloud metadata 169.254.0.0/16 explicitly
	if ip4 := ip.To4(); ip4 != nil {
		if ip4[0] == 127 || ip4[0] == 10 || ip4[0] == 0 {
			return true
		}
		if ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31 {
			return true
		}
		if ip4[0] == 192 && ip4[1] == 168 {
			return true
		}
		if ip4[0] == 169 && ip4[1] == 254 {
			return true
		}
		if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
			return true
		}
	}
	return false
}

func newSafeHTTPClient() *http.Client {
	dialer := &net.Dialer{
		Timeout:   3 * time.Second,
		KeepAlive: 15 * time.Second,
	}
	transport := &http.Transport{
		MaxIdleConns:        32,
		IdleConnTimeout:     30 * time.Second,
		TLSHandshakeTimeout: 3 * time.Second,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil || len(ips) == 0 {
				return nil, fmt.Errorf("failed to resolve host %s", host)
			}
			allowLocal := os.Getenv("KITE_ALLOW_LOCAL_IMAGE_FETCH") == "1"
			var targetIP net.IP
			for _, ipAddr := range ips {
				if !allowLocal && isPrivateOrReservedIP(ipAddr.IP) {
					return nil, fmt.Errorf("blocked private or reserved IP address for host %s", host)
				}
				if targetIP == nil {
					targetIP = ipAddr.IP
				}
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(targetIP.String(), port))
		},
	}
	return &http.Client{
		Timeout:   4 * time.Second,
		Transport: transport,
	}
}

func measureTextWidth(face font.Face, s string) float64 {
	return float64(font.MeasureString(face, s)) / 64.0
}

func wrapTextCSS(face font.Face, text string, maxWidth float64) []string {
	paragraphs := strings.Split(text, "\n")
	if maxWidth <= 10 {
		return paragraphs
	}
	var lines []string
	for _, para := range paragraphs {
		words := strings.Fields(para)
		if len(words) == 0 {
			lines = append(lines, "")
			continue
		}
		current := words[0]
		for _, word := range words[1:] {
			candidate := current + " " + word
			if measureTextWidth(face, candidate) <= maxWidth {
				current = candidate
			} else {
				lines = append(lines, current)
				current = word
			}
		}
		lines = append(lines, current)
	}
	if len(lines) == 0 {
		return []string{text}
	}
	return lines
}

func drawCSSTextBlock(dc *gg.Context, face font.Face, lines []string, x, y, w, h, fontSize, lineHeight float64, align, vAlign string) {
	if len(lines) == 0 {
		return
	}
	metrics := face.Metrics()
	ascent := float64(metrics.Ascent) / 64.0
	descent := float64(metrics.Descent) / 64.0
	lineH := fontSize * lineHeight
	blockH := float64(len(lines)) * lineH
	topY := y + (h-blockH)/2.0
	switch strings.ToLower(strings.TrimSpace(vAlign)) {
	case "top":
		topY = y
	case "bottom":
		topY = y + h - blockH
	}
	if h <= 0 {
		topY = y
	}
	for i, line := range lines {
		lw := measureTextWidth(face, line)
		lx := x
		switch align {
		case "center":
			lx = x + (w-lw)/2.0
		case "right":
			lx = x + w - lw
		}
		lineCenterY := topY + (float64(i)+0.5)*lineH
		baselineY := lineCenterY + (ascent-descent)/2.0
		dc.DrawString(line, lx, baselineY)
	}
}

func drawCSSSingleLine(dc *gg.Context, face font.Face, text string, x, centerY, ax float64) {
	metrics := face.Metrics()
	ascent := float64(metrics.Ascent) / 64.0
	descent := float64(metrics.Descent) / 64.0
	lw := measureTextWidth(face, text)
	lx := x - ax*lw
	baselineY := centerY + (ascent-descent)/2.0
	dc.DrawString(text, lx, baselineY)
}

func getFontFace(family string, bold bool, size float64) font.Face {
	return newFontFace(family, bold, false, size)
}

var varRegex = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}`)

func computeImageColors(img image.Image) (avgHex string, domHex string) {
	if img == nil {
		return "#f26522", "#f26522"
	}
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	if w <= 0 || h <= 0 {
		return "#f26522", "#f26522"
	}

	var rSum, gSum, bSum, count uint64
	bucketCounts := make(map[string]int)
	bucketColors := make(map[string][3]uint8)

	stepX := int(math.Max(1, float64(w)/64))
	stepY := int(math.Max(1, float64(h)/64))

	for y := bounds.Min.Y; y < bounds.Max.Y; y += stepY {
		for x := bounds.Min.X; x < bounds.Max.X; x += stepX {
			c := img.At(x, y)
			r, g, b, a := c.RGBA()
			if a < 32768 {
				continue
			}
			r8 := uint8(r >> 8)
			g8 := uint8(g >> 8)
			b8 := uint8(b >> 8)

			rSum += uint64(r8)
			gSum += uint64(g8)
			bSum += uint64(b8)
			count++

			qr := (r8 / 32) * 32 + 16
			qg := (g8 / 32) * 32 + 16
			qb := (b8 / 32) * 32 + 16
			key := fmt.Sprintf("%d,%d,%d", qr, qg, qb)
			bucketCounts[key]++
			bucketColors[key] = [3]uint8{qr, qg, qb}
		}
	}

	if count == 0 {
		return "#f26522", "#f26522"
	}

	avgR := uint8(rSum / count)
	avgG := uint8(gSum / count)
	avgB := uint8(bSum / count)
	avgHex = fmt.Sprintf("#%02x%02x%02x", avgR, avgG, avgB)

	maxScore := -1
	bestKey := ""
	for key, cnt := range bucketCounts {
		rgb := bucketColors[key]
		maxC := math.Max(float64(rgb[0]), math.Max(float64(rgb[1]), float64(rgb[2])))
		minC := math.Min(float64(rgb[0]), math.Min(float64(rgb[1]), float64(rgb[2])))
		sat := maxC - minC
		score := cnt * int(sat+30)
		if score > maxScore {
			maxScore = score
			bestKey = key
		}
	}

	if bestKey != "" {
		rgb := bucketColors[bestKey]
		domHex = fmt.Sprintf("#%02x%02x%02x", rgb[0], rgb[1], rgb[2])
	} else {
		domHex = avgHex
	}

	return avgHex, domHex
}

func invertHexColor(hex string) string {
	hex = strings.TrimPrefix(hex, "#")
	if len(hex) != 6 {
		return "#ffffff"
	}
	r, err1 := strconv.ParseUint(hex[0:2], 16, 8)
	g, err2 := strconv.ParseUint(hex[2:4], 16, 8)
	b, err3 := strconv.ParseUint(hex[4:6], 16, 8)
	if err1 != nil || err2 != nil || err3 != nil {
		return "#ffffff"
	}
	return fmt.Sprintf("#%02x%02x%02x", 255-uint8(r), 255-uint8(g), 255-uint8(b))
}

func calculateAndInjectPhotoColors(layers []Layer, vars map[string]any) {
	if len(layers) == 0 || vars == nil {
		return
	}

	imgIdx := 0
	usedSlugs := make(map[string]int)

	for _, layer := range layers {
		if layer.Type != LayerTypeImage {
			continue
		}

		imgSrc := resolveLayerValue(layer, "image_url", layer.ImageURL, vars)
		imgURL := interpolateString(imgSrc, vars)
		if imgURL == "" {
			imgURL = DefaultPlaceholderPhoto
		}

		img := fetchOrDecodeImage(imgURL)
		if img == nil {
			img = fetchOrDecodeImage(DefaultPlaceholderPhoto)
		}

		avgHex, domHex := computeImageColors(img)
		invHex := invertHexColor(avgHex)
		domInvHex := invertHexColor(domHex)

		inject := func(prefix string) {
			vars[prefix+".average"] = avgHex
			vars[prefix+".dominant"] = domHex
			vars[prefix+".color"] = avgHex
			vars[prefix+".inverse"] = invHex
			vars[prefix+".inverted"] = invHex
			vars[prefix+".average_inverse"] = invHex
			vars[prefix+".dominant_inverse"] = domInvHex
		}

		// 1. Inject by placeholder key from ImageURL
		if strings.Contains(layer.ImageURL, "{{") {
			matches := varRegex.FindAllStringSubmatch(layer.ImageURL, -1)
			for _, m := range matches {
				inject(m[1])
			}
		}

		// 2. Also inject for any key in vars that matches the resolved URL
		for k, v := range vars {
			if s, ok := v.(string); ok && (s == imgURL || s == imgSrc) {
				cleanK := strings.Trim(k, "{} ")
				inject(cleanK)
			}
		}

		// 3. Inject by layer ID
		if layer.ID != "" {
			inject(layer.ID)
		}

		// 4. Inject by slugified layer name (with sequential disambiguation)
		if layer.Name != "" {
			s := slugify(layer.Name)
			count := usedSlugs[s]
			usedSlugs[s]++
			if count == 0 {
				inject(s)
			} else {
				inject(fmt.Sprintf("%s_%d", s, count+1))
			}
		}

		// 5. Index-based aliases
		inject(fmt.Sprintf("image_%d", imgIdx+1))
		inject(fmt.Sprintf("photo_%d", imgIdx+1))

		// 6. Generic aliases (first image layer only)
		if imgIdx == 0 {
			inject("photo")
			inject("avatar")
			inject("image")
		}

		imgIdx++
	}
}

// ExtractImageColors extracts dominant, average, inverse, and dominantInverse hex colors for an image URI.
func ExtractImageColors(uri string) (dominant string, average string, inverse string, dominantInverse string) {
	uri = strings.TrimSpace(uri)
	if uri == "" {
		uri = DefaultPlaceholderPhoto
	}
	img := fetchOrDecodeImage(uri)
	if img == nil {
		img = fetchOrDecodeImage(DefaultPlaceholderPhoto)
	}
	avgHex, domHex := computeImageColors(img)
	return domHex, avgHex, invertHexColor(avgHex), invertHexColor(domHex)
}

// RenderImage renders the given ImageData to the requested format ("png" or "jpeg").
func RenderImage(w, h int, format string, data *ImageData, vars map[string]any) ([]byte, string, error) {
	w, h = ClampDimensions(w, h)
	if vars == nil {
		vars = make(map[string]any)
	}

	if data != nil {
		calculateAndInjectPhotoColors(data.Layers, vars)
	}

	dc := gg.NewContext(w, h)

	if data != nil {
		canvasRadius := data.BorderRadius
		if canvasRadius <= 0 {
			for _, l := range data.Layers {
				if l.Type == LayerTypeBackground && l.BorderRadius > 0 {
					canvasRadius = l.BorderRadius
					break
				}
			}
		}
		if canvasRadius > 0 {
			r := clampRadius(canvasRadius, float64(w), float64(h))
			dc.DrawRoundedRectangle(0, 0, float64(w), float64(h), r)
			dc.Clip()
		}

		layers := data.Layers
		if len(layers) > MaxLayers {
			layers = layers[:MaxLayers]
		}
		for i, layer := range layers {
			if !layer.Visible {
				continue
			}
			if !evalShowIf(layer.ShowIf, vars) {
				continue
			}
			renderLayerPNG(dc, layer, vars, 0, 0, i)
		}
	}

	var buf bytes.Buffer
	fmtLower := strings.ToLower(strings.TrimSpace(format))
	if fmtLower == "jpeg" || fmtLower == "jpg" {
		if err := jpeg.Encode(&buf, dc.Image(), &jpeg.Options{Quality: 92}); err != nil {
			return nil, "", fmt.Errorf("failed to encode JPEG: %w", err)
		}
		return buf.Bytes(), "jpg", nil
	}

	if err := dc.EncodePNG(&buf); err != nil {
		return nil, "", fmt.Errorf("failed to encode PNG: %w", err)
	}
	return buf.Bytes(), "png", nil
}

// RenderPNG renders the given ImageData to a PNG byte slice.
func RenderPNG(w, h int, data *ImageData, vars map[string]any) ([]byte, error) {
	b, _, err := RenderImage(w, h, "png", data, vars)
	return b, err
}

func evalShowIf(expr string, vars map[string]any) bool {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return true
	}
	resolved := strings.TrimSpace(interpolateString(expr, vars))
	if strings.Contains(expr, "!=") {
		parts := strings.SplitN(expr, "!=", 2)
		lhs := strings.Trim(strings.TrimSpace(interpolateString(parts[0], vars)), `"'`)
		rhs := strings.Trim(strings.TrimSpace(interpolateString(parts[1], vars)), `"'`)
		return lhs != rhs
	}
	if strings.Contains(expr, "==") {
		parts := strings.SplitN(expr, "==", 2)
		lhs := strings.Trim(strings.TrimSpace(interpolateString(parts[0], vars)), `"'`)
		rhs := strings.Trim(strings.TrimSpace(interpolateString(parts[1], vars)), `"'`)
		return lhs == rhs
	}
	if resolved == "" || strings.EqualFold(resolved, "false") || resolved == "0" || resolved == "<nil>" || resolved == "null" || resolved == "undefined" {
		return false
	}
	if !strings.Contains(expr, "{{") {
		if val := resolveVar(expr, vars); val == nil || val == false || val == "" || val == 0 {
			return false
		}
	}
	return true
}

func clampRadius(r, w, h float64) float64 {
	if r <= 0 {
		return 0
	}
	maxR := h / 2
	if w > 0 && w/2 < maxR {
		maxR = w / 2
	}
	if r > maxR {
		return maxR
	}
	return r
}

func createLinearGradient(x, y, w, h float64, grad *Gradient, vars map[string]any, opacity float64) gg.Pattern {
	if grad == nil || len(grad.Stops) < 2 {
		return nil
	}
	angle := float64(grad.Angle)
	rad := angle * math.Pi / 180.0
	dx := math.Sin(rad)
	dy := -math.Cos(rad)
	cx := x + w/2
	cy := y + h/2
	halfLen := (math.Abs(w*dx) + math.Abs(h*dy)) / 2
	x0 := cx - dx*halfLen
	y0 := cy - dy*halfLen
	x1 := cx + dx*halfLen
	y1 := cy + dy*halfLen

	p := gg.NewLinearGradient(x0, y0, x1, y1)
	for _, stop := range grad.Stops {
		stopColor := stop.Color
		if vars != nil {
			stopColor = interpolateString(stopColor, vars)
		}
		c := parseColor(stopColor, opacity)
		offset := stop.Offset
		if offset > 1.0 {
			offset = offset / 100.0
		}
		if offset < 0 {
			offset = 0
		}
		if offset > 1 {
			offset = 1
		}
		p.AddColorStop(offset, c)
	}
	return p
}

func drawStar(dc *gg.Context, cx, cy, rOuter, rInner float64) {
	for i := 0; i < 10; i++ {
		angle := -math.Pi/2 + float64(i)*math.Pi/5
		r := rOuter
		if i%2 == 1 {
			r = rInner
		}
		px := cx + r*math.Cos(angle)
		py := cy + r*math.Sin(angle)
		if i == 0 {
			dc.MoveTo(px, py)
		} else {
			dc.LineTo(px, py)
		}
	}
	dc.ClosePath()
}

func drawPolygon(dc *gg.Context, cx, cy, radius float64, sides int, rotationOffset float64) {
	if sides < 3 {
		sides = 6
	}
	for i := 0; i < sides; i++ {
		angle := rotationOffset + float64(i)*2*math.Pi/float64(sides)
		px := cx + radius*math.Cos(angle)
		py := cy + radius*math.Sin(angle)
		if i == 0 {
			dc.MoveTo(px, py)
		} else {
			dc.LineTo(px, py)
		}
	}
	dc.ClosePath()
}

func drawShapePath(dc *gg.Context, x, y, w, h, borderRadius float64, shapeType string) {
	cx := x + w/2
	cy := y + h/2
	switch shapeType {
	case "circle":
		dc.DrawEllipse(cx, cy, w/2, h/2)
	case "star":
		rOuter := math.Min(w, h) / 2
		rInner := rOuter * 0.382
		drawStar(dc, cx, cy, rOuter, rInner)
	case "hexagon":
		r := math.Min(w, h) / 2
		drawPolygon(dc, cx, cy, r, 6, -math.Pi/2)
	case "diamond":
		r := math.Min(w, h) / 2
		drawPolygon(dc, cx, cy, r, 4, -math.Pi/2)
	default:
		r := clampRadius(borderRadius, w, h)
		if r > 0 {
			dc.DrawRoundedRectangle(x, y, w, h, r)
		} else {
			dc.DrawRectangle(x, y, w, h)
		}
	}
}

// boxBlurImage applies a fast 2-pass separable box blur to an image.
func boxBlurImage(src image.Image, radius int) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	draw.Draw(dst, dst.Bounds(), src, b.Min, draw.Src)
	if radius <= 0 || w <= 1 || h <= 1 {
		return dst
	}
	if radius > 24 {
		radius = 24
	}
	tmp := image.NewNRGBA(image.Rect(0, 0, w, h))
	for pass := 0; pass < 2; pass++ {
		// Horizontal pass
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				var rSum, gSum, bSum, aSum, count int
				for k := -radius; k <= radius; k++ {
					nx := x + k
					if nx < 0 {
						nx = 0
					} else if nx >= w {
						nx = w - 1
					}
					idx := y*dst.Stride + nx*4
					rSum += int(dst.Pix[idx])
					gSum += int(dst.Pix[idx+1])
					bSum += int(dst.Pix[idx+2])
					aSum += int(dst.Pix[idx+3])
					count++
				}
				outIdx := y*tmp.Stride + x*4
				tmp.Pix[outIdx] = uint8(rSum / count)
				tmp.Pix[outIdx+1] = uint8(gSum / count)
				tmp.Pix[outIdx+2] = uint8(bSum / count)
				tmp.Pix[outIdx+3] = uint8(aSum / count)
			}
		}
		// Vertical pass
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				var rSum, gSum, bSum, aSum, count int
				for k := -radius; k <= radius; k++ {
					ny := y + k
					if ny < 0 {
						ny = 0
					} else if ny >= h {
						ny = h - 1
					}
					idx := ny*tmp.Stride + x*4
					rSum += int(tmp.Pix[idx])
					gSum += int(tmp.Pix[idx+1])
					bSum += int(tmp.Pix[idx+2])
					aSum += int(tmp.Pix[idx+3])
					count++
				}
				outIdx := y*dst.Stride + x*4
				dst.Pix[outIdx] = uint8(rSum / count)
				dst.Pix[outIdx+1] = uint8(gSum / count)
				dst.Pix[outIdx+2] = uint8(bSum / count)
				dst.Pix[outIdx+3] = uint8(aSum / count)
			}
		}
	}
	return dst
}

// makeSilhouette extracts the alpha mask of an image and tints all non-transparent pixels with the given color.
func makeSilhouette(src image.Image, tint color.Color) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	tr, tg, tb, ta := tint.RGBA()
	if ta == 0 {
		return dst
	}
	tr8 := uint8(tr >> 8)
	tg8 := uint8(tg >> 8)
	tb8 := uint8(tb >> 8)
	tintAlphaRatio := float64(ta) / 65535.0

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			_, _, _, a := src.At(b.Min.X+x, b.Min.Y+y).RGBA()
			if a > 0 {
				finalA := uint8(math.Round(float64(a>>8) * tintAlphaRatio))
				if finalA > 0 {
					outIdx := y*dst.Stride + x*4
					dst.Pix[outIdx] = tr8
					dst.Pix[outIdx+1] = tg8
					dst.Pix[outIdx+2] = tb8
					dst.Pix[outIdx+3] = finalA
				}
			}
		}
	}
	return dst
}

func renderLayerPNG(dc *gg.Context, layer Layer, vars map[string]any, offsetX, offsetY float64, idx int) {
	opacity := layer.Opacity
	if opacity <= 0 {
		opacity = 1.0
	}
	if opacity > 1.0 {
		opacity = 1.0
	}

	x := layer.X + offsetX
	y := layer.Y + offsetY

	dc.Push()
	defer dc.Pop()

	if layer.Rotation != 0 {
		cx := x + layer.Width/2
		cy := y + layer.Height/2
		dc.RotateAbout(gg.Radians(layer.Rotation), cx, cy)
	}

	switch layer.Type {
	case LayerTypeBackground, "shape":
		shapeKind := layer.ShapeType
		if layer.Type == LayerTypeBackground {
			shapeKind = "rectangle"
		}

		// Draw soft drop shadow if requested
		if layer.ShadowBlur > 0 || layer.ShadowColor != "" {
			sc := layer.ShadowColor
			if sc == "" {
				sc = "rgba(0,0,0,0.45)"
			}
			blurSteps := 3
			maxSpread := math.Min(16, math.Max(2, layer.ShadowBlur*0.5))
			for s := blurSteps; s >= 1; s-- {
				spread := maxSpread * (float64(s) / float64(blurSteps))
				stepAlpha := (opacity * 0.35) / float64(blurSteps)
				dc.SetColor(parseColor(sc, stepAlpha))
				drawShapePath(dc, x-spread/2, y-spread/2+2, layer.Width+spread, layer.Height+spread, layer.BorderRadius+spread/2, shapeKind)
				dc.Fill()
			}
		}

		// Apply glassmorphism backdrop blur if configured
		if layer.BackdropBlur > 0 && layer.Rotation == 0 {
			bx := int(math.Max(0, x))
			by := int(math.Max(0, y))
			bw := int(math.Min(float64(dc.Width()-bx), layer.Width))
			bh := int(math.Min(float64(dc.Height()-by), layer.Height))
			if bw > 2 && bh > 2 {
				sub := image.NewNRGBA(image.Rect(0, 0, bw, bh))
				draw.Draw(sub, sub.Bounds(), dc.Image(), image.Point{X: bx, Y: by}, draw.Src)
				blurred := boxBlurImage(sub, int(math.Round(layer.BackdropBlur/2)))
				dc.Push()
				drawShapePath(dc, x, y, layer.Width, layer.Height, layer.BorderRadius, shapeKind)
				dc.Clip()
				dc.DrawImage(blurred, bx, by)
				dc.Pop()
				dc.ResetClip()
			}
		}

		hasGrad := (layer.FillType == "gradient" || layer.FillType == "linear-gradient" || (layer.FillType == "" && layer.Gradient != nil && len(layer.Gradient.Stops) > 0)) && layer.FillType != "solid"
		var pat gg.Pattern
		if hasGrad {
			pat = createLinearGradient(x, y, layer.Width, layer.Height, layer.Gradient, vars, opacity)
		}
		if pat != nil {
			dc.SetFillStyle(pat)
		} else {
			col := layer.Color
			if col == "" {
				if layer.Type == LayerTypeBackground {
					col = "#1e1f22"
				} else {
					col = "#2b2d31"
				}
			}
			col = interpolateString(col, vars)
			dc.SetColor(parseColor(col, opacity))
		}

		drawShapePath(dc, x, y, layer.Width, layer.Height, layer.BorderRadius, shapeKind)
		dc.Fill()

		if layer.BorderWidth > 0 {
			bc := layer.BorderColor
			if bc == "" {
				bc = "#3f4147"
			}
			bc = interpolateString(bc, vars)
			dc.SetColor(parseColor(bc, opacity))
			dc.SetLineWidth(layer.BorderWidth)
			drawShapePath(dc, x, y, layer.Width, layer.Height, layer.BorderRadius, shapeKind)
			dc.Stroke()
		}

	case LayerTypeText:
		content := resolveLayerValue(layer, "text", layer.Content, vars)
		text := interpolateString(content, vars)
		if text == "" {
			return
		}
		switch strings.ToLower(layer.TextTransform) {
		case "uppercase":
			text = strings.ToUpper(text)
		case "lowercase":
			text = strings.ToLower(text)
		}

		fontSize := layer.FontSize
		if fontSize <= 0 {
			fontSize = 16
		}
		isBold := strings.EqualFold(layer.FontWeight, "bold") || layer.FontWeight == "600" || layer.FontWeight == "700" || layer.FontWeight == "800" || layer.FontWeight == "900" || strings.Contains(strings.ToLower(layer.FontFamily), "impact")
		isItalic := strings.EqualFold(layer.FontStyle, "italic")
		face := newFontFace(layer.FontFamily, isBold, isItalic, fontSize)
		dc.SetFontFace(face)

		// Dynamic Auto-Fit: shrink font size until text fits within layer.Width
		if layer.AutoFit && layer.Width > 10 {
			for fontSize > 8 {
				tw := measureTextWidth(face, text)
				if tw <= layer.Width {
					break
				}
				fontSize -= 1.0
				face = newFontFace(layer.FontFamily, isBold, isItalic, fontSize)
				dc.SetFontFace(face)
			}
		}

		// Truncate with ellipsis if enabled
		if layer.Truncate && layer.Width > 10 {
			tw := measureTextWidth(face, text)
			if tw > layer.Width {
				runes := []rune(text)
				for len(runes) > 1 {
					runes = runes[:len(runes)-1]
					candidate := string(runes) + "…"
					cw := measureTextWidth(face, candidate)
					if cw <= layer.Width {
						text = candidate
						break
					}
				}
			}
		}

		lineSpacing := layer.LineHeight
		if lineSpacing <= 0 {
			lineSpacing = 1.25
		}

		var lines []string
		if layer.Truncate {
			lines = strings.Split(text, "\n")
		} else {
			lines = wrapTextCSS(face, text, layer.Width)
		}

		hAlign := "left"
		vAlign := "middle"
		if layer.VerticalAlign != "" {
			vAlign = strings.ToLower(strings.TrimSpace(layer.VerticalAlign))
		}

		rawAlign := strings.ToLower(strings.TrimSpace(layer.TextAlign))
		if strings.Contains(rawAlign, "top") {
			vAlign = "top"
		} else if strings.Contains(rawAlign, "bottom") {
			vAlign = "bottom"
		}

		if strings.Contains(rawAlign, "right") {
			hAlign = "right"
		} else if strings.Contains(rawAlign, "center") || rawAlign == "middle" {
			hAlign = "center"
		}

		// Draw text shadow if specified
		if layer.ShadowBlur > 0 || layer.ShadowColor != "" {
			sc := layer.ShadowColor
			if sc == "" {
				sc = "rgba(0,0,0,0.6)"
			}
			dc.SetColor(parseColor(sc, opacity*0.75))
			drawCSSTextBlock(dc, face, lines, x+2, y+2, layer.Width, layer.Height, fontSize, lineSpacing, hAlign, vAlign)
		}

		// Draw text outline/stroke if specified
		if layer.StrokeWidth > 0 && layer.StrokeColor != "" {
			dc.SetColor(parseColor(interpolateString(layer.StrokeColor, vars), opacity))
			sw := math.Min(8, layer.StrokeWidth)
			offsets := [][2]float64{
				{-sw, 0}, {sw, 0}, {0, -sw}, {0, sw},
				{-sw * 0.7, -sw * 0.7}, {sw * 0.7, -sw * 0.7},
				{-sw * 0.7, sw * 0.7}, {sw * 0.7, sw * 0.7},
			}
			for _, off := range offsets {
				drawCSSTextBlock(dc, face, lines, x+off[0], y+off[1], layer.Width, layer.Height, fontSize, lineSpacing, hAlign, vAlign)
			}
		}

		textColor := layer.Color
		if textColor == "" {
			textColor = "#ffffff"
		}
		textColor = interpolateString(textColor, vars)
		dc.SetColor(parseColor(textColor, opacity))
		drawCSSTextBlock(dc, face, lines, x, y, layer.Width, layer.Height, fontSize, lineSpacing, hAlign, vAlign)

	case LayerTypeImage:
		imgSrc := resolveLayerValue(layer, "image_url", layer.ImageURL, vars)
		imgURL := interpolateString(imgSrc, vars)
		var img image.Image
		if imgURL != "" {
			img = fetchOrDecodeImage(imgURL)
		}
		if img == nil {
			img = fetchOrDecodeImage(DefaultPlaceholderPhoto)
		}

		if img != nil && layer.Blur > 0 {
			img = boxBlurImage(img, int(math.Round(layer.Blur)))
		}

		maskShape := strings.ToLower(layer.Mask)
		r := clampRadius(layer.BorderRadius, layer.Width, layer.Height)
		if maskShape == "circle" {
			r = math.Min(layer.Width, layer.Height) / 2
		}

		isSilhouetteBorder := (layer.BorderMode == "silhouette") || (layer.BorderMode != "box" && maskShape == "" && r == 0)
		isSilhouetteShadow := (layer.ShadowMode == "silhouette") || (layer.ShadowMode != "box" && maskShape == "" && r == 0)

		if img == nil {
			dc.Push()
			drawShapePath(dc, x, y, layer.Width, layer.Height, r, maskShape)
			dc.Clip()
			dc.SetColor(parseColor("#2b2d31", opacity))
			dc.DrawRectangle(x, y, layer.Width, layer.Height)
			dc.Fill()
			dc.SetFontFace(newFontFace("", true, false, 12))
			dc.SetColor(parseColor("#949ba4", opacity))
			dc.DrawStringAnchored("Image", x+layer.Width/2, y+layer.Height/2, 0.5, 0.5)
			dc.Pop()
			dc.ResetClip()
		} else {
			// Compute placement & scale for ObjectFit
			srcBounds := img.Bounds()
			srcW := float64(srcBounds.Dx())
			srcH := float64(srcBounds.Dy())
			fitMode := strings.ToLower(layer.ObjectFit)
			if fitMode == "" {
				fitMode = "cover"
			}

			var transX, transY, scaleX, scaleY float64
			switch fitMode {
			case "fill", "stretch":
				scaleX = layer.Width / srcW
				scaleY = layer.Height / srcH
				transX = x
				transY = y
			case "contain":
				scale := math.Min(layer.Width/srcW, layer.Height/srcH)
				scaleX = scale
				scaleY = scale
				drawW := srcW * scale
				drawH := srcH * scale
				transX = x + (layer.Width-drawW)/2
				transY = y + (layer.Height-drawH)/2
			default: // "cover"
				scale := math.Max(layer.Width/srcW, layer.Height/srcH)
				scaleX = scale
				scaleY = scale
				drawW := srcW * scale
				drawH := srcH * scale
				transX = x + (layer.Width-drawW)/2
				transY = y + (layer.Height-drawH)/2
			}

			// 1. Draw Drop Shadow
			if layer.ShadowBlur > 0 || layer.ShadowColor != "" {
				sc := layer.ShadowColor
				if sc == "" {
					sc = "rgba(0,0,0,0.45)"
				}
				if isSilhouetteShadow {
					shadowCol := parseColor(sc, opacity*0.6)
					shadowSil := makeSilhouette(img, shadowCol)
					blurRad := int(math.Round(layer.ShadowBlur / 2))
					if blurRad < 2 {
						blurRad = 2
					}
					blurred := boxBlurImage(shadowSil, blurRad)
					dc.Push()
					dc.Translate(transX, transY+2)
					dc.Scale(scaleX, scaleY)
					dc.DrawImage(blurred, 0, 0)
					dc.Pop()
				} else {
					dc.Push()
					dc.SetColor(parseColor(sc, opacity*0.55))
					spread := 3.0
					drawShapePath(dc, x-spread, y-spread+2, layer.Width+spread*2, layer.Height+spread*2, r+spread, maskShape)
					dc.Fill()
					dc.Pop()
				}
			}

			// 2. Draw Silhouette Outline (Sticker Border)
			if isSilhouetteBorder && layer.BorderWidth > 0 {
				bc := layer.BorderColor
				if bc == "" {
					bc = "#ffffff"
				}
				bc = interpolateString(bc, vars)
				borderCol := parseColor(bc, opacity)
				borderSil := makeSilhouette(img, borderCol)

				bw := layer.BorderWidth
				steps := 16
				for i := 0; i < steps; i++ {
					ang := float64(i) * 2.0 * math.Pi / float64(steps)
					ox := math.Cos(ang) * bw
					oy := math.Sin(ang) * bw
					dc.Push()
					dc.Translate(transX+ox, transY+oy)
					dc.Scale(scaleX, scaleY)
					dc.DrawImage(borderSil, 0, 0)
					dc.Pop()
				}
			}

			// 3. Draw Image
			dc.Push()
			if maskShape != "" || r > 0 {
				drawShapePath(dc, x, y, layer.Width, layer.Height, r, maskShape)
				dc.Clip()
			}
			dc.Translate(transX, transY)
			dc.Scale(scaleX, scaleY)
			dc.DrawImage(img, 0, 0)
			dc.Pop()
			dc.ResetClip()

			// 4. Draw Overlay Tint
			if layer.OverlayColor != "" {
				dc.Push()
				if maskShape != "" || r > 0 {
					drawShapePath(dc, x, y, layer.Width, layer.Height, r, maskShape)
					dc.Clip()
				}
				dc.SetColor(parseColor(interpolateString(layer.OverlayColor, vars), opacity))
				dc.DrawRectangle(x, y, layer.Width, layer.Height)
				dc.Fill()
				dc.Pop()
				dc.ResetClip()
			}

			// 5. Draw Bounding Box Border (if not silhouette mode)
			if !isSilhouetteBorder && layer.BorderWidth > 0 {
				bc := layer.BorderColor
				if bc == "" {
					bc = "#ffffff"
				}
				bc = interpolateString(bc, vars)
				dc.Push()
				dc.SetColor(parseColor(bc, opacity))
				dc.SetLineWidth(layer.BorderWidth)
				drawShapePath(dc, x, y, layer.Width, layer.Height, r, maskShape)
				dc.Stroke()
				dc.Pop()
			}
		}

		// Optional Discord Avatar Decoration / Collectible Frame
		if layer.AvatarDecoration != "" {
			decorURL := interpolateString(layer.AvatarDecoration, vars)
			if decorURL != "" {
				decorImg := fetchOrDecodeImage(decorURL)
				if decorImg != nil {
					srcB := decorImg.Bounds()
					sW := float64(srcB.Dx())
					sH := float64(srcB.Dy())
					if sW > 0 && sH > 0 {
						minDim := math.Min(layer.Width, layer.Height)
						decorSize := minDim * 1.2
						decorX := x + (layer.Width-decorSize)/2
						decorY := y + (layer.Height-decorSize)/2
						dc.Push()
						dc.Translate(decorX, decorY)
						dc.Scale(decorSize/sW, decorSize/sH)
						dc.DrawImage(decorImg, 0, 0)
						dc.Pop()
					}
				}
			}
		}

		// Optional Discord Status Indicator Dot (online, idle, dnd, offline, streaming)
		if layer.StatusValue != "" {
			statusStr := strings.ToLower(strings.TrimSpace(interpolateString(layer.StatusValue, vars)))
			if strings.HasPrefix(statusStr, "{{") {
				statusStr = "online"
			}
			statusCol := ""
			switch statusStr {
			case "online", "active":
				statusCol = "#23a55a"
			case "idle", "away":
				statusCol = "#f0b232"
			case "dnd", "do_not_disturb":
				statusCol = "#f23f43"
			case "offline", "invisible":
				statusCol = "#80848e"
			case "streaming":
				statusCol = "#593695"
			}
			if statusCol != "" {
				minDim := math.Min(layer.Width, layer.Height)
				dotR := math.Max(6, minDim*0.14)
				isCircular := layer.Mask == "circle" || layer.BorderRadius >= minDim*0.4
				var dotX, dotY float64
				if isCircular {
					dotX = x + layer.Width*0.85
					dotY = y + layer.Height*0.85
				} else {
					dotX = x + layer.Width - dotR*0.85
					dotY = y + layer.Height - dotR*0.85
				}
				dc.Push()
				// Outer border ring for cutout effect
				dc.SetColor(parseColor("#111214", opacity))
				dc.DrawCircle(dotX, dotY, dotR+math.Max(2, dotR*0.28))
				dc.Fill()

				// Base status color
				dc.SetColor(parseColor(statusCol, opacity))
				dc.DrawCircle(dotX, dotY, dotR)
				dc.Fill()

				// Discord authentic inner badge cutouts
				dc.SetColor(parseColor("#111214", opacity))
				switch statusStr {
				case "idle", "away":
					// Top-left crescent moon bite
					dc.DrawCircle(dotX-dotR*0.5, dotY-dotR*0.5, dotR*0.75)
					dc.Fill()
				case "dnd", "do_not_disturb":
					// Horizontal bar
					barW := dotR * 1.3
					barH := dotR * 0.4
					dc.DrawRoundedRectangle(dotX-barW/2, dotY-barH/2, barW, barH, barH/2)
					dc.Fill()
				case "offline", "invisible":
					// Hollow center
					dc.DrawCircle(dotX, dotY, dotR*0.5)
					dc.Fill()
				case "streaming":
					// White play triangle
					dc.SetColor(parseColor("#ffffff", opacity))
					dc.MoveTo(dotX-dotR*0.25, dotY-dotR*0.5)
					dc.LineTo(dotX+dotR*0.5, dotY)
					dc.LineTo(dotX-dotR*0.25, dotY+dotR*0.5)
					dc.ClosePath()
					dc.Fill()
				}
				dc.Pop()
			}
		}

	case LayerTypeProgressBar:
		valRaw := resolveLayerValue(layer, "value", layer.Value, vars)
		maxRaw := resolveLayerValue(layer, "max_value", layer.MaxValue, vars)
		valStr := interpolateString(valRaw, vars)
		maxStr := interpolateString(maxRaw, vars)
		val := parseFloat(valStr, 0)
		maxVal := parseFloat(maxStr, 100)
		if maxVal <= 0 {
			maxVal = 100
		}
		ratio := val / maxVal
		if ratio < 0 {
			ratio = 0
		}
		if ratio > 1 {
			ratio = 1
		}

		bgCol := layer.BackgroundColor
		if bgCol == "" {
			bgCol = "rgba(255, 255, 255, 0.15)"
		}
		col := layer.FillColor
		if col == "" {
			col = "#5865F2"
		}
		col = interpolateString(col, vars)

		if layer.ProgressStyle == "ring" || layer.ProgressStyle == "circle" {
			cx := x + layer.Width/2
			cy := y + layer.Height/2
			thickness := math.Max(6, math.Min(layer.Width, layer.Height)*0.12)
			radius := math.Min(layer.Width, layer.Height)/2 - thickness/2 - 2
			if radius > 2 {
				dc.SetLineWidth(thickness)
				dc.SetLineCapRound()
				dc.SetColor(parseColor(bgCol, opacity))
				dc.DrawCircle(cx, cy, radius)
				dc.Stroke()

				if ratio > 0 {
					dc.SetColor(parseColor(col, opacity))
					startAngle := -math.Pi / 2
					endAngle := startAngle + ratio*2*math.Pi
					dc.DrawArc(cx, cy, radius, startAngle, endAngle)
					dc.Stroke()
				}
			}
		} else if layer.ProgressStyle == "segmented" {
			segments := 10
			segGap := 6.0
			segW := (layer.Width - float64(segments-1)*segGap) / float64(segments)
			if segW < 2 {
				segW = 2
			}
			activeSegs := int(math.Floor(ratio*float64(segments) + 0.5))
			segR := clampRadius(math.Min(4, layer.BorderRadius), segW, layer.Height)
			for s := 0; s < segments; s++ {
				sx := x + float64(s)*(segW+segGap)
				if s < activeSegs {
					dc.SetColor(parseColor(col, opacity))
				} else {
					dc.SetColor(parseColor(bgCol, opacity))
				}
				if segR > 0 {
					dc.DrawRoundedRectangle(sx, y, segW, layer.Height, segR)
				} else {
					dc.DrawRectangle(sx, y, segW, layer.Height)
				}
				dc.Fill()
			}
		} else {
			fillW := layer.Width * ratio
			r := clampRadius(layer.BorderRadius, layer.Width, layer.Height)

			// Draw track
			dc.SetColor(parseColor(bgCol, opacity))
			if r > 0 {
				dc.DrawRoundedRectangle(x, y, layer.Width, layer.Height, r)
			} else {
				dc.DrawRectangle(x, y, layer.Width, layer.Height)
			}
			dc.Fill()

			// Draw fill
			if fillW > 0 {
				fillR := clampRadius(layer.BorderRadius, fillW, layer.Height)
				useGradient := (layer.FillType == "gradient" || layer.FillType == "linear-gradient") && layer.FillGradient != nil && len(layer.FillGradient.Stops) >= 2
				if useGradient {
					if pat := createLinearGradient(x, y, fillW, layer.Height, layer.FillGradient, vars, opacity); pat != nil {
						dc.SetFillStyle(pat)
					} else {
						dc.SetColor(parseColor(col, opacity))
					}
				} else {
					dc.SetColor(parseColor(col, opacity))
				}
				if fillR > 0 {
					dc.DrawRoundedRectangle(x, y, fillW, layer.Height, fillR)
				} else {
					dc.DrawRectangle(x, y, fillW, layer.Height)
				}
				dc.Fill()
			}
		}

		if layer.ShowText {
			pbFontSize := layer.FontSize
			if pbFontSize <= 0 {
				pbFontSize = 12
			}
			pbFontWeight := layer.FontWeight == "" || strings.EqualFold(layer.FontWeight, "bold") || layer.FontWeight == "600" || layer.FontWeight == "700" || layer.FontWeight == "800" || layer.FontWeight == "900"
			pbFace := newFontFace(layer.FontFamily, pbFontWeight, false, pbFontSize)
			dc.SetFontFace(pbFace)

			pbTextColor := layer.TextColor
			if pbTextColor == "" {
				pbTextColor = "#ffffff"
			}
			pbTextColor = interpolateString(pbTextColor, vars)
			dc.SetColor(parseColor(pbTextColor, opacity))

			pctStr := fmt.Sprintf("%d%%", int(math.Floor(ratio*100+0.5)))
			drawCSSSingleLine(dc, pbFace, pctStr, x+layer.Width/2, y+layer.Height/2, 0.5)
		}

	case LayerTypeBadge:
		lblRaw := resolveLayerValue(layer, "label", layer.Label, vars)
		label := interpolateString(lblRaw, vars)
		badgeBg := layer.Color
		if badgeBg == "" {
			badgeBg = "#5865F2"
		}
		badgeBg = interpolateString(badgeBg, vars)

		badgeColor := layer.TextColor
		if badgeColor == "" {
			badgeColor = "#ffffff"
		}
		badgeColor = interpolateString(badgeColor, vars)

		badgeFontSize := layer.FontSize
		if badgeFontSize <= 0 {
			badgeFontSize = 12
		}
		isBold := layer.FontWeight == "" || strings.EqualFold(layer.FontWeight, "bold") || layer.FontWeight == "600" || layer.FontWeight == "700" || layer.FontWeight == "800" || layer.FontWeight == "900"
		badgeFace := newFontFace(layer.FontFamily, isBold, false, badgeFontSize)
		dc.SetFontFace(badgeFace)

		r := layer.BorderRadius
		if r <= 0 {
			r = layer.Height / 2
		}
		r = clampRadius(r, layer.Width, layer.Height)

		hasGrad := (layer.FillType == "gradient" || layer.FillType == "linear-gradient" || (layer.FillType == "" && layer.Gradient != nil && len(layer.Gradient.Stops) > 0)) && layer.FillType != "solid"
		var pat gg.Pattern
		if hasGrad {
			pat = createLinearGradient(x, y, layer.Width, layer.Height, layer.Gradient, vars, opacity)
		}
		if pat != nil {
			dc.SetFillStyle(pat)
		} else {
			dc.SetColor(parseColor(badgeBg, opacity))
		}
		dc.DrawRoundedRectangle(x, y, layer.Width, layer.Height, r)
		dc.Fill()

		if layer.BorderWidth > 0 {
			bc := layer.BorderColor
			if bc == "" {
				bc = "#ffffff"
			}
			dc.SetColor(parseColor(interpolateString(bc, vars), opacity))
			dc.SetLineWidth(layer.BorderWidth)
			dc.DrawRoundedRectangle(x, y, layer.Width, layer.Height, r)
			dc.Stroke()
		}

		dc.SetColor(parseColor(badgeColor, opacity))
		drawCSSSingleLine(dc, badgeFace, label, x+layer.Width/2, y+layer.Height/2, 0.5)

	case LayerTypeRepeater:
		itemsExpr := resolveLayerValue(layer, "items", layer.ItemsExpression, vars)
		items := resolveArrayVar(itemsExpr, vars)
		if len(items) == 0 {
			return
		}
		maxItems := layer.MaxItems
		if maxItems <= 0 {
			maxItems = 10
		}
		if maxItems > 25 {
			maxItems = 25
		}
		if len(items) > maxItems {
			items = items[:maxItems]
		}
		gap := layer.Gap
		if gap < 0 {
			gap = 8
		}
		itemH := layer.ItemHeight
		if itemH <= 0 {
			itemH = 40
		}
		curX := x
		curY := y

		for rIdx, item := range items {
			itemVars := make(map[string]any)
			for k, v := range vars {
				itemVars[k] = v
			}
			itemVars["index"] = rIdx + 1
			itemVars["rank"] = rIdx + 1
			itemVars["item"] = item
			if itemMap, ok := item.(map[string]any); ok {
				for mk, mv := range itemMap {
					itemVars[mk] = mv
				}
			}

			if layer.ItemTemplate != nil {
				tpl := layer.ItemTemplate
				rowBg := tpl.RowBackgroundColor
				if rIdx%2 == 1 && tpl.AlternateRowColor != "" {
					rowBg = tpl.AlternateRowColor
				}
				if rowBg != "" {
					dc.SetColor(parseColor(rowBg, opacity))
					dc.DrawRoundedRectangle(curX, curY, layer.Width, itemH, float64(tpl.BorderRadius))
					dc.Fill()
				}

				innerX := curX + 12
				centerY := curY + itemH/2

				if tpl.ShowRank {
					rCol := tpl.RankColor
					if rCol == "" {
						rCol = "#949ba4"
					}
					rankFace := newFontFace(layer.FontFamily, true, false, 12)
					dc.SetFontFace(rankFace)
					dc.SetColor(parseColor(rCol, opacity))
					drawCSSSingleLine(dc, rankFace, fmt.Sprintf("#%d", rIdx+1), innerX, centerY, 0)
					innerX += 32
				}

				if tpl.ShowAvatar {
					avatarURL := ""
					if tpl.AvatarField != "" {
						avatarURL = fmt.Sprint(itemVars[tpl.AvatarField])
					}
					if avatarURL != "" && avatarURL != "<nil>" {
						avImg := fetchOrDecodeImage(avatarURL)
						if avImg != nil {
							avSize := 28.0
							avY := curY + (itemH-avSize)/2
							dc.Push()
							dc.DrawRoundedRectangle(innerX, avY, avSize, avSize, avSize/2)
							dc.Clip()
							sb := avImg.Bounds()
							if sb.Dx() > 0 && sb.Dy() > 0 {
								dc.Translate(innerX, avY)
								dc.Scale(avSize/float64(sb.Dx()), avSize/float64(sb.Dy()))
								dc.DrawImage(avImg, 0, 0)
							}
							dc.Pop()
							dc.ResetClip()
						}
					}
					innerX += 36
				}

				nameVal := ""
				if tpl.NameField != "" {
					nameVal = fmt.Sprint(itemVars[tpl.NameField])
				}
				if nameVal != "" && nameVal != "<nil>" {
					nCol := tpl.NameColor
					if nCol == "" {
						nCol = "#ffffff"
					}
					nameFace := newFontFace(layer.FontFamily, true, false, 12)
					dc.SetFontFace(nameFace)
					dc.SetColor(parseColor(nCol, opacity))
					drawCSSSingleLine(dc, nameFace, nameVal, innerX, centerY, 0)
				}

				scoreVal := ""
				if tpl.ScoreField != "" {
					scoreVal = fmt.Sprint(itemVars[tpl.ScoreField])
				}
				if scoreVal != "" && scoreVal != "<nil>" {
					sCol := tpl.ScoreColor
					if sCol == "" {
						sCol = "#5865F2"
					}
					scoreFace := newFontFace(layer.FontFamily, true, false, 12)
					dc.SetFontFace(scoreFace)
					dc.SetColor(parseColor(sCol, opacity))
					drawCSSSingleLine(dc, scoreFace, scoreVal, curX+layer.Width-12, centerY, 1.0)
				}
			}

			if layer.Direction == "horizontal" {
				curX += layer.Width + gap
			} else {
				curY += itemH + gap
			}
		}
	}
}

func decodeSafeImage(data []byte) image.Image {
	if len(data) == 0 || len(data) > maxImageDownloadBytes {
		return nil
	}
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil
	}
	if cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > maxDecodedDimension || cfg.Height > maxDecodedDimension {
		return nil
	}
	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil
	}
	return img
}

func fetchOrDecodeImage(uri string) image.Image {
	uri = strings.TrimSpace(uri)
	if strings.HasPrefix(uri, "data:image/") {
		commaIdx := strings.Index(uri, ",")
		if commaIdx == -1 {
			return nil
		}
		raw, err := base64.StdEncoding.DecodeString(uri[commaIdx+1:])
		if err != nil {
			return nil
		}
		return decodeSafeImage(raw)
	}

	if strings.HasPrefix(uri, "http://") || strings.HasPrefix(uri, "https://") {
		imgCacheLock.RLock()
		cached, ok := imgCache[uri]
		imgCacheLock.RUnlock()
		if ok {
			return cached
		}

		req, err := http.NewRequest("GET", uri, nil)
		if err != nil {
			return nil
		}
		req.Header.Set("User-Agent", "KiteImageRenderer/1.0")
		req.Header.Set("Accept", "image/webp,image/png,image/jpeg,image/*;q=0.8")

		resp, err := httpClient.Do(req)
		if err != nil {
			return nil
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			return nil
		}
		bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, maxImageDownloadBytes+1))
		if err != nil || len(bodyBytes) > maxImageDownloadBytes {
			return nil
		}
		img := decodeSafeImage(bodyBytes)
		if img == nil {
			return nil
		}

		b := img.Bounds()
		if b.Dx() <= 1024 && b.Dy() <= 1024 {
			imgCacheLock.Lock()
			if len(imgCache) >= maxImageCacheEntries {
				imgCache = make(map[string]image.Image)
			}
			imgCache[uri] = img
			imgCacheLock.Unlock()
		}

		return img
	}

	return nil
}

func parseColor(s string, opacity float64) color.Color {
	s = strings.TrimSpace(s)
	if s == "" {
		return color.Transparent
	}

	// rgba(r, g, b, a)
	if strings.HasPrefix(s, "rgba(") && strings.HasSuffix(s, ")") {
		parts := strings.Split(s[5:len(s)-1], ",")
		if len(parts) == 4 {
			r := parseInt(parts[0], 0)
			g := parseInt(parts[1], 0)
			b := parseInt(parts[2], 0)
			a := parseFloat(parts[3], 1.0) * opacity
			return color.NRGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: uint8(a * 255)}
		}
	}

	// rgb(r, g, b)
	if strings.HasPrefix(s, "rgb(") && strings.HasSuffix(s, ")") {
		parts := strings.Split(s[4:len(s)-1], ",")
		if len(parts) == 3 {
			r := parseInt(parts[0], 0)
			g := parseInt(parts[1], 0)
			b := parseInt(parts[2], 0)
			return color.NRGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: uint8(opacity * 255)}
		}
	}

	// Hex #RRGGBB or #RGB
	if strings.HasPrefix(s, "#") {
		hex := s[1:]
		if len(hex) == 3 {
			r, _ := strconv.ParseUint(string([]byte{hex[0], hex[0]}), 16, 8)
			g, _ := strconv.ParseUint(string([]byte{hex[1], hex[1]}), 16, 8)
			b, _ := strconv.ParseUint(string([]byte{hex[2], hex[2]}), 16, 8)
			return color.NRGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: uint8(opacity * 255)}
		}
		if len(hex) == 6 {
			r, _ := strconv.ParseUint(hex[0:2], 16, 8)
			g, _ := strconv.ParseUint(hex[2:4], 16, 8)
			b, _ := strconv.ParseUint(hex[4:6], 16, 8)
			return color.NRGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: uint8(opacity * 255)}
		}
		if len(hex) == 8 {
			r, _ := strconv.ParseUint(hex[0:2], 16, 8)
			g, _ := strconv.ParseUint(hex[2:4], 16, 8)
			b, _ := strconv.ParseUint(hex[4:6], 16, 8)
			a, _ := strconv.ParseUint(hex[6:8], 16, 8)
			return color.NRGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: uint8(float64(a) * opacity)}
		}
	}

	switch strings.ToLower(s) {
	case "white":
		return color.NRGBA{R: 255, G: 255, B: 255, A: uint8(opacity * 255)}
	case "black":
		return color.NRGBA{R: 0, G: 0, B: 0, A: uint8(opacity * 255)}
	case "transparent":
		return color.Transparent
	}

	return color.NRGBA{R: 255, G: 255, B: 255, A: uint8(opacity * 255)}
}

func parseInt(s string, fallback int) int {
	i, err := strconv.Atoi(strings.TrimSpace(s))
	if err != nil {
		return fallback
	}
	return i
}
