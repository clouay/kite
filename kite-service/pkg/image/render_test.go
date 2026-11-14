package image

import (
	"bytes"
	"image"
	"net"
	"strings"
	"sync"
	"testing"
)

func TestRenderSVG(t *testing.T) {
	data := &ImageData{
		Layers: []Layer{
			{
				ID:           "bg",
				Type:         LayerTypeBackground,
				Name:         "Card BG",
				X:            20,
				Y:            20,
				Width:        760,
				Height:       260,
				Visible:      true,
				Opacity:      0.9,
				Color:        "#2b2d31",
				BorderRadius: 16,
			},
			{
				ID:         "text-1",
				Type:       LayerTypeText,
				Name:       "Title",
				X:          40,
				Y:          40,
				Width:      300,
				Height:     40,
				Visible:    true,
				Content:    "Welcome {{ user.name }}!",
				FontSize:   24,
				FontWeight: "bold",
				Color:      "#ffffff",
			},
			{
				ID:           "bar-1",
				Type:         LayerTypeProgressBar,
				Name:         "Progress",
				X:            40,
				Y:            120,
				Width:        400,
				Height:       20,
				Visible:      true,
				Value:        "{{ xp }}",
				MaxValue:     "1000",
				FillColor:    "#5865F2",
				BorderRadius: 10,
			},
			{
				ID:           "badge-1",
				Type:         LayerTypeBadge,
				Name:         "Rank",
				X:            500,
				Y:            40,
				Width:        100,
				Height:       32,
				Visible:      true,
				Label:        "Rank #{{ rank }}",
				Color:        "#3ba55c",
				TextColor:    "#ffffff",
				FontSize:     14,
				BorderRadius: 16,
			},
		},
	}

	vars := map[string]any{
		"user": map[string]any{
			"name": "KiteMaster",
		},
		"xp":   500,
		"rank": 1,
	}

	res, err := RenderSVG(800, 300, data, vars)
	if err != nil {
		t.Fatalf("RenderSVG failed: %v", err)
	}

	if res.Width != 800 || res.Height != 300 {
		t.Errorf("expected 800x300, got %dx%d", res.Width, res.Height)
	}

	if !strings.Contains(res.SVG, "Welcome KiteMaster!") {
		t.Errorf("SVG missing interpolated text 'Welcome KiteMaster!': %s", res.SVG)
	}

	if !strings.Contains(res.SVG, "Rank #1") {
		t.Errorf("SVG missing interpolated badge 'Rank #1': %s", res.SVG)
	}

	if !strings.HasPrefix(res.DataURL, "data:image/svg+xml;base64,") {
		t.Errorf("DataURL missing expected prefix")
	}
}

func TestRenderPNGWithTest2Template(t *testing.T) {
	data := &ImageData{
		Layers: []Layer{
			{
				ID: "bg-2", Type: LayerTypeBackground, Name: "Background",
				Width: 800, Height: 360, Visible: true,
			},
			{
				ID: "layer-mvvn1zx7-cfsi", Type: LayerTypeText, Name: "username",
				Content: "{{username}}", FontSize: 54, FontWeight: "bold",
				Color: "#ffffff", Width: 462, Height: 117, X: 32, Y: 190, Visible: true,
			},
			{
				ID: "layer-mvvn2yb8-o2zv", Type: LayerTypeProgressBar, Name: "Level Progress",
				Value: "{{user.xp}}", MaxValue: "2000", Width: 701, Height: 29,
				X: 48, Y: 51, Visible: true, FillColor: "#5865F2", ShowText: true,
			},
			{
				ID: "layer-mvvn5tiv-uz60", Type: LayerTypeText, Name: "Level",
				Content: "Level {{level}}", FontSize: 24, FontWeight: "bold",
				Color: "#ffffff", Width: 260, Height: 48, X: 52, Y: 80, Visible: true,
			},
		},
	}

	vars := map[string]any{
		"username":             "clouay",
		"level":                "5",
		"level_progress_value": "1000",
		"image_avatar_url":     "https://example.com/avatar.png",
	}

	pngBytes, err := RenderPNG(800, 360, data, vars)
	if err != nil {
		t.Fatalf("RenderPNG failed: %v", err)
	}
	if len(pngBytes) == 0 {
		t.Fatalf("expected non-empty png bytes")
	}

	res, err := RenderSVG(800, 360, data, vars)
	if err != nil {
		t.Fatalf("RenderSVG failed: %v", err)
	}
	if !strings.Contains(res.SVG, "clouay") {
		t.Errorf("SVG missing 'clouay': %s", res.SVG)
	}
	if !strings.Contains(res.SVG, "Level 5") {
		t.Errorf("SVG missing 'Level 5': %s", res.SVG)
	}
}

func TestFetchDiscordAvatar(t *testing.T) {
	url := "https://cdn.discordapp.com/avatars/1229512532516016149/50dd0eb04f3727738a7b8d35843b08a8.webp"
	img := fetchOrDecodeImage(url)
	if img == nil {
		t.Fatalf("fetchOrDecodeImage returned nil for Discord avatar %s", url)
	}
	t.Logf("Decoded bounds: %v", img.Bounds())
}

func TestAvatarLayerPNG(t *testing.T) {
	layer := Layer{
		ID:       "layer-mvvn3qt1-tndw",
		Name:     "Image / Avatar",
		Type:     LayerTypeImage,
		Width:    187,
		Height:   187,
		X:        551,
		Y:        117,
		ImageURL: "{{image_avatar}}",
		Visible:  true,
		Opacity:  1,
	}
	vars := map[string]any{
		"image_avatar_url": "https://cdn.discordapp.com/avatars/1229512532516016149/50dd0eb04f3727738a7b8d35843b08a8.webp",
	}

	data := &ImageData{
		Layers: []Layer{layer},
	}
	pngBytes, err := RenderPNG(800, 360, data, vars)
	if err != nil {
		t.Fatalf("RenderPNG failed: %v", err)
	}
	t.Logf("Generated PNG bytes len=%d", len(pngBytes))

	// Check if any pixels in the image are non-transparent
	img, _, err := image.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		t.Fatalf("Failed to decode generated PNG: %v", err)
	}
	// Check pixel at (551+90, 117+90)
	c := img.At(551+90, 117+90)
	_, _, _, a := c.RGBA()
	t.Logf("Pixel at center of avatar: %v, alpha=%d", c, a)
	if a == 0 {
		t.Fatalf("Avatar pixel is transparent, image did not draw!")
	}
}

func TestSampleDataOverride(t *testing.T) {
	vars := map[string]any{
		"image_avatar":     "Sample image_avatar",
		"image_avatar_url": "https://cdn.discordapp.com/avatars/1229512532516016149/50dd0eb04f3727738a7b8d35843b08a8.webp",
	}

	val := resolveVar("image_avatar", vars)
	if val != "https://cdn.discordapp.com/avatars/1229512532516016149/50dd0eb04f3727738a7b8d35843b08a8.webp" {
		t.Fatalf("expected real url, got %v", val)
	}
}

func TestRenderSVGRepeater(t *testing.T) {
	data := &ImageData{
		Layers: []Layer{
			{
				ID:              "rep-1",
				Type:            LayerTypeRepeater,
				Name:            "Leaderboard",
				X:               20,
				Y:               30,
				Width:           560,
				Height:          200,
				Visible:         true,
				ItemsExpression: "players",
				Direction:       "vertical",
				ItemHeight:      45,
				Gap:             10,
				MaxItems:        3,
				ItemTemplate: &RepeaterTemplate{
					ShowRank:           true,
					RankColor:          "#949ba4",
					NameField:          "name",
					NameColor:          "#ffffff",
					ScoreField:         "score",
					ScoreColor:         "#5865F2",
					RowBackgroundColor: "#232428",
					BorderRadius:       8,
				},
			},
		},
	}

	vars := map[string]any{
		"players": []any{
			map[string]any{"name": "Alice", "score": 950},
			map[string]any{"name": "Bob", "score": 820},
		},
	}

	res, err := RenderSVG(600, 400, data, vars)
	if err != nil {
		t.Fatalf("RenderSVG failed: %v", err)
	}

	if !strings.Contains(res.SVG, "Alice") {
		t.Errorf("SVG missing repeater item Alice: %s", res.SVG)
	}
	if !strings.Contains(res.SVG, "950") {
		t.Errorf("SVG missing repeater score 950: %s", res.SVG)
	}
	if !strings.Contains(res.SVG, "Bob") {
		t.Errorf("SVG missing repeater item Bob: %s", res.SVG)
	}
}

func TestImagePlaceholderLinking(t *testing.T) {
	data := &ImageData{
		Layers: []Layer{
			{
				ID:      "player_name",
				Type:    LayerTypeText,
				Content: "Default Name",
				Width:   200,
				Height:  40,
				Visible: true,
			},
			{
				ID:      "rank_badge",
				Type:    LayerTypeBadge,
				Label:   "Default Role",
				Width:   100,
				Height:  30,
				Visible: true,
			},
		},
	}

	// Test with {{imagename.layer.layerfield}} and imagename.layer.layerfield keys
	vars := map[string]any{
		"welcome_card.player_name.text": "DiscordHero",
		"{{welcome_card.rank_badge.label}}": "VIP Member",
	}

	res, err := RenderSVG(800, 300, data, vars)
	if err != nil {
		t.Fatalf("RenderSVG failed: %v", err)
	}

	if !strings.Contains(res.SVG, "DiscordHero") {
		t.Errorf("SVG missing linked text 'DiscordHero': %s", res.SVG)
	}

	if !strings.Contains(res.SVG, "VIP Member") {
		t.Errorf("SVG missing linked badge 'VIP Member': %s", res.SVG)
	}

	// Also test raster rendering
	pngBytes, err := RenderPNG(800, 300, data, vars)
	if err != nil {
		t.Fatalf("RenderPNG failed: %v", err)
	}
	if len(pngBytes) == 0 {
		t.Fatalf("RenderPNG returned empty bytes")
	}

	// Test friendly key names (e.g. "player_name" or "rank_badge")
	friendlyVars := map[string]any{
		"player_name": "FriendlyHero",
		"rank_badge":  "Legendary",
	}
	resFriendly, err := RenderSVG(800, 300, data, friendlyVars)
	if err != nil {
		t.Fatalf("RenderSVG with friendlyVars failed: %v", err)
	}
	if !strings.Contains(resFriendly.SVG, "FriendlyHero") {
		t.Errorf("SVG missing friendly key 'FriendlyHero': %s", resFriendly.SVG)
	}
	if !strings.Contains(resFriendly.SVG, "Legendary") {
		t.Errorf("SVG missing friendly key 'Legendary': %s", resFriendly.SVG)
	}
}

func TestMultipleBackgroundLayersAndGradientOverlay(t *testing.T) {
	data := &ImageData{
		Layers: []Layer{
			{
				ID:      "base-bg",
				Type:    LayerTypeBackground,
				Name:    "Base Background",
				X:       0,
				Y:       0,
				Width:   800,
				Height:  400,
				Visible: true,
				Color:   "#1e1f22",
			},
			{
				ID:       "banner-img",
				Type:     LayerTypeImage,
				Name:     "Banner Image",
				X:        0,
				Y:        0,
				Width:    800,
				Height:   400,
				Visible:  true,
				ImageURL: "https://cdn.discordapp.com/avatars/1229512532516016149/50dd0eb04f3727738a7b8d35843b08a8.webp",
			},
			{
				ID:      "grad-overlay",
				Type:    LayerTypeBackground,
				Name:    "Transparent Gradient Overlay",
				X:       0,
				Y:       0,
				Width:   800,
				Height:  400,
				Visible: true,
				Gradient: &Gradient{
					Angle: 180,
					Stops: []GradientStop{
						{Offset: 0, Color: "rgba(0,0,0,0)"},
						{Offset: 1, Color: "rgba(0,0,0,0.85)"},
					},
				},
			},
			{
				ID:       "title-text",
				Type:     LayerTypeText,
				Name:     "Title",
				X:        50,
				Y:        320,
				Width:    400,
				Height:   50,
				Visible:  true,
				Content:  "Welcome to the Server",
				Color:    "#ffffff",
				FontSize: 32,
			},
		},
	}

	pngBytes, err := RenderPNG(800, 400, data, map[string]any{})
	if err != nil {
		t.Fatalf("RenderPNG failed: %v", err)
	}
	if len(pngBytes) == 0 {
		t.Fatalf("RenderPNG returned empty bytes")
	}

	img, _, err := image.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		t.Fatalf("Failed to decode generated PNG: %v", err)
	}

	// Verify pixel in top region (near y=50) where gradient is transparent:
	// Banner image should show through with strong alpha
	cTop := img.At(400, 50)
	_, _, _, aTop := cTop.RGBA()
	if aTop == 0 {
		t.Fatalf("Top area should not be transparent: %v", cTop)
	}

	// Verify pixel in bottom region (near y=380) where gradient is dark/semi-opaque
	cBot := img.At(400, 380)
	_, _, _, aBot := cBot.RGBA()
	if aBot == 0 {
		t.Fatalf("Bottom area should not be transparent: %v", cBot)
	}

	// Verify SVG renders both backgrounds in correct order
	resSVG, err := RenderSVG(800, 400, data, map[string]any{})
	if err != nil {
		t.Fatalf("RenderSVG failed: %v", err)
	}
	if !strings.Contains(resSVG.SVG, "#1e1f22") || !strings.Contains(resSVG.SVG, "grad-overlay") {
		t.Fatalf("SVG should contain both background layers")
	}
	if !strings.Contains(resSVG.SVG, "Welcome to the Server") {
		t.Fatalf("SVG should contain text layer")
	}
}


func TestCanvaFeaturesAndSecurity(t *testing.T) {
	// 1. SSRF private IP checks
	privateIPs := []string{"127.0.0.1", "10.0.0.1", "172.16.5.4", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1"}
	for _, s := range privateIPs {
		ip := net.ParseIP(s)
		if !isPrivateOrReservedIP(ip) {
			t.Fatalf("expected IP %s to be blocked as private/reserved", s)
		}
	}
	publicIP := net.ParseIP("8.8.8.8")
	if isPrivateOrReservedIP(publicIP) {
		t.Fatalf("expected 8.8.8.8 to be allowed as public IP")
	}

	// 2. Dimension clamping
	w, h := ClampDimensions(50000, 50000)
	if w != MaxCanvasDimension || h != MaxCanvasDimension {
		t.Fatalf("expected clamped dimensions %dx%d, got %dx%d", MaxCanvasDimension, MaxCanvasDimension, w, h)
	}

	// 3. Canva features: rotation, backdrop_blur, ring/segmented progress, text auto_fit + uppercase + stroke, JPEG output
	data := &ImageData{
		Version: 1,
		Layers: []Layer{
			{
				ID:      "bg",
				Type:    LayerTypeBackground,
				Visible: true,
				X:       0, Y: 0, Width: 800, Height: 300,
				Color: "#111214",
			},
			{
				ID:           "glass-card",
				Type:         LayerTypeShape,
				ShapeType:    "rectangle",
				Visible:      true,
				X:            40, Y: 30, Width: 720, Height: 240,
				Color:        "rgba(255, 255, 255, 0.08)",
				BackdropBlur: 8,
				BorderRadius: 20,
				BorderWidth:  1,
				BorderColor:  "rgba(255, 255, 255, 0.2)",
			},
			{
				ID:        "hex-shape",
				Type:      LayerTypeShape,
				ShapeType: "hexagon",
				Visible:   true,
				X:         70, Y: 70, Width: 120, Height: 120,
				Rotation:  15,
				Color:     "#5865F2",
			},
			{
				ID:            "ring-xp",
				Type:          LayerTypeProgressBar,
				ProgressStyle: "ring",
				Visible:       true,
				X:             230, Y: 70, Width: 110, Height: 110,
				Value:         "75",
				MaxValue:      "100",
				FillColor:     "#23a55a",
				ShowText:      true,
			},
			{
				ID:            "seg-xp",
				Type:          LayerTypeProgressBar,
				ProgressStyle: "segmented",
				Visible:       true,
				X:             370, Y: 180, Width: 320, Height: 22,
				Value:         "60",
				MaxValue:      "100",
				FillColor:     "#5865F2",
				BorderRadius:  4,
			},
			{
				ID:            "hero-title",
				Type:          LayerTypeText,
				Visible:       true,
				X:             370, Y: 75, Width: 320, Height: 60,
				Content:       "SuperLongUsernameThatNeedsAutoFit",
				FontSize:      36,
				FontWeight:    "bold",
				TextTransform: "uppercase",
				AutoFit:       true,
				StrokeWidth:   2,
				StrokeColor:   "#000000",
				Color:         "#ffffff",
			},
		},
	}

	// Concurrent rendering stress test
	var wg sync.WaitGroup
	for i := 0; i < 6; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			bytesOut, ext, err := RenderImage(800, 300, "jpeg", data, map[string]any{})
			if err != nil {
				t.Errorf("concurrent RenderImage failed: %v", err)
				return
			}
			if ext != "jpg" || len(bytesOut) == 0 {
				t.Errorf("unexpected output ext=%s len=%d", ext, len(bytesOut))
			}
		}()
	}
	wg.Wait()
}
