package image

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"math"
	"regexp"
	"strconv"
	"strings"
)

type RenderResult struct {
	SVG     string
	DataURL string
	Width   int
	Height  int
}

func RenderSVG(w, h int, data *ImageData, vars map[string]any) (*RenderResult, error) {
	if w <= 0 {
		w = 800
	}
	if h <= 0 {
		h = 400
	}

	if vars == nil {
		vars = make(map[string]any)
	}

	var defs strings.Builder
	var content strings.Builder

	canvasRadius := 0.0
	if data != nil {
		canvasRadius = data.BorderRadius
		if canvasRadius <= 0 {
			for _, l := range data.Layers {
				if l.Type == LayerTypeBackground && l.BorderRadius > 0 {
					canvasRadius = l.BorderRadius
					break
				}
			}
		}
	}
	if canvasRadius > 0 {
		r := clampRadius(canvasRadius, float64(w), float64(h))
		defs.WriteString(fmt.Sprintf(`<clipPath id="kite-canvas-clip"><rect x="0" y="0" width="%d" height="%d" rx="%.1f" ry="%.1f" /></clipPath>`, w, h, r, r))
	}

	if data != nil {
		for i, layer := range data.Layers {
			if !layer.Visible {
				continue
			}
			renderLayer(&content, &defs, layer, vars, 0, 0, i)
		}
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 %d %d" width="%d" height="%d">`, w, h, w, h))

	if defs.Len() > 0 {
		sb.WriteString("<defs>")
		sb.WriteString(defs.String())
		sb.WriteString("</defs>")
	}
	if canvasRadius > 0 {
		sb.WriteString(`<g clip-path="url(#kite-canvas-clip)">`)
		sb.WriteString(content.String())
		sb.WriteString("</g>")
	} else {
		sb.WriteString(content.String())
	}
	sb.WriteString("</svg>")

	svgStr := sb.String()
	dataURL := "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svgStr))

	return &RenderResult{
		SVG:     svgStr,
		DataURL: dataURL,
		Width:   w,
		Height:  h,
	}, nil
}

func getStarSVGPoints(cx, cy, rOuter, rInner float64) string {
	var pts []string
	for i := 0; i < 10; i++ {
		angle := -math.Pi/2 + float64(i)*math.Pi/5
		r := rOuter
		if i%2 == 1 {
			r = rInner
		}
		px := cx + r*math.Cos(angle)
		py := cy + r*math.Sin(angle)
		pts = append(pts, fmt.Sprintf("%.1f,%.1f", px, py))
	}
	return strings.Join(pts, " ")
}

func renderLayer(sb *strings.Builder, defs *strings.Builder, layer Layer, vars map[string]any, offsetX, offsetY float64, idx int) {
	opacity := layer.Opacity
	if opacity <= 0 {
		opacity = 1.0
	}

	x := layer.X + offsetX
	y := layer.Y + offsetY

	switch layer.Type {
	case LayerTypeBackground, "shape":
		strokeAttr := ""
		if layer.BorderWidth > 0 {
			bc := layer.BorderColor
			if bc == "" {
				bc = "#3f4147"
			}
			strokeAttr = fmt.Sprintf(` stroke="%s" stroke-width="%.1f"`,
				html.EscapeString(interpolateString(bc, vars)),
				layer.BorderWidth,
			)
		}

		hasGrad := (layer.FillType == "gradient" || layer.FillType == "linear-gradient" || (layer.FillType == "" && layer.Gradient != nil && len(layer.Gradient.Stops) > 0)) && layer.FillType != "solid"
		fillVal := ""
		if hasGrad && layer.Gradient != nil && len(layer.Gradient.Stops) > 0 {
			gradID := fmt.Sprintf("grad-%s-%d", layer.ID, idx)
			defs.WriteString(renderGradientDef(gradID, layer.Gradient))
			fillVal = fmt.Sprintf("url(#%s)", gradID)
		} else {
			col := layer.Color
			if col == "" {
				col = "#1e1f22"
			}
			fillVal = html.EscapeString(interpolateString(col, vars))
		}

		if layer.Type == "shape" && layer.ShapeType == "circle" {
			sb.WriteString(fmt.Sprintf(
				`<ellipse cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="%s" opacity="%.2f"%s />`,
				x+layer.Width/2, y+layer.Height/2, layer.Width/2, layer.Height/2,
				fillVal, opacity, strokeAttr,
			))
		} else if layer.Type == "shape" && layer.ShapeType == "star" {
			cx := x + layer.Width/2
			cy := y + layer.Height/2
			rOuter := math.Min(layer.Width, layer.Height) / 2
			rInner := rOuter * 0.382
			pts := getStarSVGPoints(cx, cy, rOuter, rInner)
			sb.WriteString(fmt.Sprintf(
				`<polygon points="%s" fill="%s" opacity="%.2f"%s />`,
				pts, fillVal, opacity, strokeAttr,
			))
		} else {
			sb.WriteString(fmt.Sprintf(
				`<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s" opacity="%.2f"%s />`,
				x, y, layer.Width, layer.Height, layer.BorderRadius,
				fillVal, opacity, strokeAttr,
			))
		}

	case LayerTypeText:
		content := resolveLayerValue(layer, "text", layer.Content, vars)
		text := interpolateString(content, vars)
		fontSize := layer.FontSize
		if fontSize <= 0 {
			fontSize = 16
		}
		fontFamily := layer.FontFamily
		if fontFamily == "" {
			fontFamily = "sans-serif"
		}
		fontWeight := layer.FontWeight
		if fontWeight == "" {
			fontWeight = "normal"
		}
		textColor := layer.Color
		if textColor == "" {
			textColor = "#ffffff"
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

		textAnchor := "start"
		textX := x
		if hAlign == "center" {
			textAnchor = "middle"
			textX = x + layer.Width/2
		} else if hAlign == "right" {
			textAnchor = "end"
			textX = x + layer.Width
		}

		dominantBaseline := "central"
		textY := y + layer.Height/2
		if vAlign == "top" {
			dominantBaseline = "hanging"
			textY = y
		} else if vAlign == "bottom" {
			dominantBaseline = "auto"
			textY = y + layer.Height
		}

		strokeAttr := ""
		if layer.StrokeWidth > 0 && layer.StrokeColor != "" {
			strokeAttr = fmt.Sprintf(` stroke="%s" stroke-width="%.1f"`,
				html.EscapeString(interpolateString(layer.StrokeColor, vars)),
				layer.StrokeWidth,
			)
		}

		sb.WriteString(fmt.Sprintf(
			`<text x="%.1f" y="%.1f" font-family="%s" font-size="%.1f" font-weight="%s" fill="%s" text-anchor="%s" dominant-baseline="%s" opacity="%.2f"%s>%s</text>`,
			textX, textY,
			html.EscapeString(fontFamily),
			fontSize,
			html.EscapeString(fontWeight),
			html.EscapeString(interpolateString(textColor, vars)),
			textAnchor,
			dominantBaseline,
			opacity,
			strokeAttr,
			html.EscapeString(text),
		))

	case LayerTypeImage:
		imgSrc := resolveLayerValue(layer, "image_url", layer.ImageURL, vars)
		imgURL := interpolateString(imgSrc, vars)
		if imgURL == "" {
			return
		}
		clipID := fmt.Sprintf("clip-%s-%.0f-%.0f-%d", layer.ID, x, y, idx)
		defs.WriteString(fmt.Sprintf(
			`<clipPath id="%s"><rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" /></clipPath>`,
			clipID, x, y, layer.Width, layer.Height, layer.BorderRadius,
		))
		sb.WriteString(fmt.Sprintf(
			`<image href="%s" x="%.1f" y="%.1f" width="%.1f" height="%.1f" preserveAspectRatio="xMidYMid slice" clip-path="url(#%s)" opacity="%.2f" />`,
			html.EscapeString(imgURL),
			x, y, layer.Width, layer.Height,
			clipID, opacity,
		))

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
		fillW := layer.Width * ratio

		bgCol := layer.BackgroundColor
		if bgCol == "" {
			bgCol = "rgba(255,255,255,0.15)"
		}
		col := layer.FillColor
		if col == "" {
			col = "#5865F2"
		}
		sb.WriteString(fmt.Sprintf(
			`<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s" opacity="%.2f" />`,
			x, y, layer.Width, layer.Height, layer.BorderRadius,
			html.EscapeString(bgCol), opacity,
		))
		if fillW > 0 {
			sb.WriteString(fmt.Sprintf(
				`<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s" opacity="%.2f" />`,
				x, y, fillW, layer.Height, layer.BorderRadius,
				html.EscapeString(interpolateString(col, vars)), opacity,
			))
		}
		if layer.ShowText {
			pbFontFamily := layer.FontFamily
			if pbFontFamily == "" {
				pbFontFamily = "sans-serif"
			}
			pbFontSize := layer.FontSize
			if pbFontSize <= 0 {
				pbFontSize = 12
			}
			pbFontWeight := layer.FontWeight
			if pbFontWeight == "" {
				pbFontWeight = "bold"
			}
			pbTextColor := layer.TextColor
			if pbTextColor == "" {
				pbTextColor = "#ffffff"
			}
			pctStr := fmt.Sprintf("%.0f%%", ratio*100)
			sb.WriteString(fmt.Sprintf(
				`<text x="%.1f" y="%.1f" font-family="%s" font-size="%.1f" font-weight="%s" fill="%s" text-anchor="middle" opacity="%.2f">%s</text>`,
				x+layer.Width/2, y+(layer.Height+pbFontSize)/2-1,
				html.EscapeString(pbFontFamily), pbFontSize, html.EscapeString(pbFontWeight),
				html.EscapeString(interpolateString(pbTextColor, vars)),
				opacity, pctStr,
			))
		}

	case LayerTypeBadge:
		lblRaw := resolveLayerValue(layer, "label", layer.Label, vars)
		label := interpolateString(lblRaw, vars)
		badgeBg := layer.Color
		if badgeBg == "" {
			badgeBg = "#5865F2"
		}
		badgeColor := layer.TextColor
		if badgeColor == "" {
			badgeColor = "#ffffff"
		}
		badgeFontSize := layer.FontSize
		if badgeFontSize <= 0 {
			badgeFontSize = 12
		}
		badgeFontFamily := layer.FontFamily
		if badgeFontFamily == "" {
			badgeFontFamily = "sans-serif"
		}
		badgeFontWeight := layer.FontWeight
		if badgeFontWeight == "" {
			badgeFontWeight = "bold"
		}
		sb.WriteString(fmt.Sprintf(
			`<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%.1f" fill="%s" opacity="%.2f" />`,
			x, y, layer.Width, layer.Height, layer.BorderRadius,
			html.EscapeString(interpolateString(badgeBg, vars)), opacity,
		))
		textX := x + layer.Width/2
		textY := y + (layer.Height+badgeFontSize)/2 - 1
		sb.WriteString(fmt.Sprintf(
			`<text x="%.1f" y="%.1f" font-family="%s" font-size="%.1f" font-weight="%s" fill="%s" text-anchor="middle" opacity="%.2f">%s</text>`,
			textX, textY, html.EscapeString(badgeFontFamily), badgeFontSize,
			html.EscapeString(badgeFontWeight),
			html.EscapeString(interpolateString(badgeColor, vars)),
			opacity,
			html.EscapeString(label),
		))

	case LayerTypeRepeater:
		itemsExpr := resolveLayerValue(layer, "items", layer.ItemsExpression, vars)
		items := resolveArrayVar(itemsExpr, vars)
		if len(items) == 0 {
			return
		}
		maxItems := layer.MaxItems
		if maxItems > 0 && len(items) > maxItems {
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
					sb.WriteString(fmt.Sprintf(
						`<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" rx="%d" fill="%s" opacity="%.2f" />`,
						curX, curY, layer.Width, itemH, tpl.BorderRadius,
						html.EscapeString(rowBg), opacity,
					))
				}
				repFontFamily := layer.FontFamily
				if repFontFamily == "" {
					repFontFamily = "sans-serif"
				}
				innerX := curX + 12
				if tpl.ShowRank {
					rCol := tpl.RankColor
					if rCol == "" {
						rCol = "#949ba4"
					}
					sb.WriteString(fmt.Sprintf(
						`<text x="%.1f" y="%.1f" font-family="%s" font-size="14" font-weight="bold" fill="%s" text-anchor="start">#%d</text>`,
						innerX, curY+itemH/2+5, html.EscapeString(repFontFamily), html.EscapeString(rCol), rIdx+1,
					))
					innerX += 36
				}
				if tpl.ShowAvatar {
					avatarURL := ""
					if tpl.AvatarField != "" {
						avatarURL = fmt.Sprint(itemVars[tpl.AvatarField])
					}
					if avatarURL != "" && avatarURL != "<nil>" {
						sb.WriteString(fmt.Sprintf(
							`<image href="%s" x="%.1f" y="%.1f" width="28" height="28" preserveAspectRatio="xMidYMid slice" />`,
							html.EscapeString(avatarURL), innerX, curY+(itemH-28)/2,
						))
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
					sb.WriteString(fmt.Sprintf(
						`<text x="%.1f" y="%.1f" font-family="%s" font-size="14" font-weight="600" fill="%s" text-anchor="start">%s</text>`,
						innerX, curY+itemH/2+5, html.EscapeString(repFontFamily), html.EscapeString(nCol), html.EscapeString(nameVal),
					))
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
					sb.WriteString(fmt.Sprintf(
						`<text x="%.1f" y="%.1f" font-family="%s" font-size="14" font-weight="bold" fill="%s" text-anchor="end">%s</text>`,
						curX+layer.Width-16, curY+itemH/2+5, html.EscapeString(repFontFamily), html.EscapeString(sCol), html.EscapeString(scoreVal),
					))
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

func renderGradientDef(id string, grad *Gradient) string {
	stops := ""
	for _, s := range grad.Stops {
		stops += fmt.Sprintf(`<stop offset="%.1f%%" stop-color="%s" />`, s.Offset, html.EscapeString(s.Color))
	}
	return fmt.Sprintf(`<linearGradient id="%s" x1="0%%" y1="0%%" x2="100%%" y2="100%%">%s</linearGradient>`, id, stops)
}

func isValidVarExpr(s string) bool {
	if s == "" || len(s) > 120 {
		return false
	}
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '.' || r == '-' || r == ':' || r == '(' || r == ')' || r == '\'') {
			return false
		}
	}
	return true
}

func interpolateString(s string, vars map[string]any) string {
	if s == "" || len(vars) == 0 {
		return s
	}
	if !strings.Contains(s, "{") {
		return s
	}

	res := s
	// 1. Double curly braces {{expr}}
	for {
		start := strings.Index(res, "{{")
		if start == -1 {
			break
		}
		end := strings.Index(res[start+2:], "}}")
		if end == -1 {
			break
		}
		end = start + 2 + end + 2
		expr := strings.TrimSpace(res[start+2 : end-2])
		val := resolveVar(expr, vars)
		valStr := fmt.Sprint(val)
		if val == nil || valStr == "<nil>" {
			valStr = ""
		}
		res = res[:start] + valStr + res[end:]
	}

	// 2. Single curly braces {expr}
	idx := 0
	for {
		if idx >= len(res) {
			break
		}
		start := strings.Index(res[idx:], "{")
		if start == -1 {
			break
		}
		start = idx + start
		if start+1 < len(res) && res[start+1] == '{' {
			idx = start + 2
			continue
		}
		end := strings.Index(res[start+1:], "}")
		if end == -1 {
			break
		}
		end = start + 1 + end + 1
		expr := strings.TrimSpace(res[start+1 : end-1])
		if isValidVarExpr(expr) {
			val := resolveVar(expr, vars)
			valStr := fmt.Sprint(val)
			if val == nil || valStr == "<nil>" {
				valStr = ""
			}
			res = res[:start] + valStr + res[end:]
			idx = start + len(valStr)
		} else {
			idx = end
		}
	}
	return res
}

// resolveLayerValue searches vars for any key targeting this layer and field.
// Supports:
// 1. imagename.layerID.fieldName (e.g. "welcome_card.avatar.image_url" or "{{welcome_card.avatar.image_url}}")
// 2. layerID.fieldName (e.g. "avatar.image_url" or "avatar.url")
// 3. layerID (e.g. "avatar")
var slugRegex = regexp.MustCompile("[^a-z0-9]+")

func slugify(s string) string {
	s = strings.ToLower(s)
	s = slugRegex.ReplaceAllString(s, "_")
	return strings.Trim(s, "_")
}

func resolveLayerValue(layer Layer, fieldName string, defaultValue string, vars map[string]any) string {
	if len(vars) == 0 {
		return defaultValue
	}

	aliases := []string{fieldName}
	if fieldName == "content" || fieldName == "text" {
		aliases = []string{"text", "content"}
	} else if fieldName == "image_url" || fieldName == "url" || fieldName == "avatar" {
		aliases = []string{"image_url", "url", "avatar", "image"}
	} else if fieldName == "label" {
		aliases = []string{"label", "text"}
	} else if fieldName == "items" || fieldName == "items_expression" {
		aliases = []string{"items", "items_expression"}
	} else if fieldName == "value" {
		aliases = []string{"value"}
	} else if fieldName == "max_value" {
		aliases = []string{"max_value"}
	}

	// Build key candidates for this layer (ID, friendly Name, slugified name)
	candidates := make([]string, 0, 6)
	if layer.ID != "" {
		candidates = append(candidates, layer.ID)
	}
	if layer.Name != "" {
		candidates = append(candidates, layer.Name)
		slug := slugify(layer.Name)
		if slug != "" && slug != strings.ToLower(layer.ID) {
			candidates = append(candidates, slug)
		}
	}

	// 1. Check candidate + alias combinations (e.g. "player_name.text", "xp_value", "avatar_url")
	for _, cand := range candidates {
		for _, alias := range aliases {
			keyDot := cand + "." + alias
			keyUnder := cand + "_" + alias

			for _, k := range []string{keyDot, keyUnder} {
				if val, ok := vars[k]; ok && val != nil && fmt.Sprint(val) != "" {
					return fmt.Sprint(val)
				}
				if val, ok := vars["{{"+k+"}}"]; ok && val != nil && fmt.Sprint(val) != "" {
					return fmt.Sprint(val)
				}
			}
		}
	}

	// 2. Direct layer ID check (e.g. vars["player_name"] or vars["badge-1"])
	if layer.ID != "" {
		if val, ok := vars[layer.ID]; ok && val != nil && fmt.Sprint(val) != "" {
			return fmt.Sprint(val)
		}
		if val, ok := vars["{{"+layer.ID+"}}"]; ok && val != nil && fmt.Sprint(val) != "" {
			return fmt.Sprint(val)
		}
	}

	isExplicitImageURL := (fieldName == "image_url" || fieldName == "url" || fieldName == "avatar") &&
		(strings.HasPrefix(defaultValue, "http://") || strings.HasPrefix(defaultValue, "https://") || strings.HasPrefix(defaultValue, "data:")) &&
		defaultValue != DefaultPlaceholderPhoto

	// 3. Candidate name check alone, provided defaultValue doesn't contain an inline template placeholder
	// (If defaultValue has "{{ ... }}", the variable is likely for interpolation inside that template)
	if !strings.Contains(defaultValue, "{{") && !isExplicitImageURL {
		for _, cand := range candidates {
			if val, ok := vars[cand]; ok && val != nil && fmt.Sprint(val) != "" {
				return fmt.Sprint(val)
			}
			if val, ok := vars["{{"+cand+"}}"]; ok && val != nil && fmt.Sprint(val) != "" {
				return fmt.Sprint(val)
			}
		}
	}

	// 4. Iterate vars to find any matching suffix like "rank_card.username.text" or "{{rank_card.username.text}}"
	for _, cand := range candidates {
		for _, alias := range aliases {
			targetSuffix := "." + cand + "." + alias
			targetUnderSuffix := "." + cand + "_" + alias
			for k, v := range vars {
				if v == nil || fmt.Sprint(v) == "" {
					continue
				}
				cleanK := strings.Trim(k, "{} ")
				if strings.HasSuffix(cleanK, targetSuffix) || strings.HasSuffix(cleanK, targetUnderSuffix) {
					return fmt.Sprint(v)
				}
			}
		}

		if !isExplicitImageURL {
			// Suffix match on candidate alone (e.g. ".username")
			candSuffix := "." + cand
			for k, v := range vars {
				if v == nil || fmt.Sprint(v) == "" {
					continue
				}
				cleanK := strings.Trim(k, "{} ")
				if strings.HasSuffix(cleanK, candSuffix) {
					return fmt.Sprint(v)
				}
			}
		}
	}

	return defaultValue
}

func isSampleVal(v any) bool {
	if v == nil {
		return true
	}
	s := strings.TrimSpace(fmt.Sprint(v))
	return strings.HasPrefix(s, "Sample ") || strings.HasPrefix(s, "sample_")
}

func resolveVar(path string, vars map[string]any) any {
	if len(vars) == 0 {
		return ""
	}
	clean := strings.Trim(path, "{} ")

	// Prefer exact match if not sample
	if v, ok := vars[clean]; ok && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
		return v
	}
	if v, ok := vars[path]; ok && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
		return v
	}
	if v, ok := vars["{{"+clean+"}}"]; ok && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
		return v
	}

	// 0. High priority avatar and user lookups
	if clean == "avatar" || clean == "avatar_url" || clean == "image_avatar" {
		for _, ak := range []string{"avatar_url", "avatar", "image_avatar", "user.avatar_url", "user.avatar", "user_avatar_url"} {
			if v, ok := vars[ak]; ok && v != nil && !isSampleVal(v) {
				return v
			}
		}
	}
	if clean == "username" {
		for _, uk := range []string{"username", "user.username", "user_username"} {
			if v, ok := vars[uk]; ok && v != nil && !isSampleVal(v) {
				return v
			}
		}
	}

	// 1. Try url / value / image suffix aliases
	if !strings.HasSuffix(clean, "_url") {
		if v, ok := vars[clean+"_url"]; ok && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
			return v
		}
	}
	if strings.HasSuffix(clean, "_url") {
		if v, ok := vars[strings.TrimSuffix(clean, "_url")]; ok && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
			return v
		}
	}
	if !strings.HasSuffix(clean, "_value") {
		if v, ok := vars[clean+"_value"]; ok && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
			return v
		}
	}
	if strings.HasSuffix(clean, "_value") {
		if v, ok := vars[strings.TrimSuffix(clean, "_value")]; ok && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
			return v
		}
	}

	// 2. Case-insensitive lookup (non-sample)
	for k, v := range vars {
		kClean := strings.Trim(k, "{} ")
		if strings.EqualFold(kClean, clean) && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
			return v
		}
		if !strings.HasSuffix(clean, "_url") && strings.EqualFold(kClean, clean+"_url") && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
			return v
		}
		if strings.HasSuffix(clean, "_url") && strings.EqualFold(kClean, strings.TrimSuffix(clean, "_url")) && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
			return v
		}
	}

	// 3. Dot path or prefix matching
	cleanSuffix := "." + clean
	for k, v := range vars {
		kClean := strings.Trim(k, "{} ")
		if strings.HasSuffix(kClean, cleanSuffix) && v != nil && fmt.Sprint(v) != "" && !isSampleVal(v) {
			return v
		}
	}

	parts := strings.Split(clean, ".")
	if len(parts) > 1 {
		last := parts[len(parts)-1]
		if v, ok := vars[last]; ok && v != nil && !isSampleVal(v) {
			return v
		}
		if v, ok := vars[last+"_url"]; ok && v != nil && !isSampleVal(v) {
			return v
		}
		if v, ok := vars[last+"_value"]; ok && v != nil && !isSampleVal(v) {
			return v
		}
		flat := strings.ReplaceAll(clean, ".", "_")
		if v, ok := vars[flat]; ok && v != nil && !isSampleVal(v) {
			return v
		}
	}

	var cur any = vars
	for _, part := range parts {
		if m, ok := cur.(map[string]any); ok {
			cur = m[part]
		} else {
			cur = nil
			break
		}
	}
	if cur != nil && !isSampleVal(cur) {
		return cur
	}

	// Fallback to sample values if present
	if v, ok := vars[clean]; ok && v != nil && fmt.Sprint(v) != "" {
		return v
	}
	if !strings.HasSuffix(clean, "_url") {
		if v, ok := vars[clean+"_url"]; ok && v != nil && fmt.Sprint(v) != "" {
			return v
		}
	}
	if cur != nil {
		return cur
	}
	return ""
}

func resolveArrayVar(key string, vars map[string]any) []any {
	if key == "" {
		return nil
	}
	val := resolveVar(key, vars)
	if val == nil || val == "" {
		return nil
	}
	if arr, ok := val.([]any); ok {
		return arr
	}
	if arr, ok := val.([]map[string]any); ok {
		res := make([]any, len(arr))
		for i, v := range arr {
			res[i] = v
		}
		return res
	}
	if str, ok := val.(string); ok && strings.HasPrefix(strings.TrimSpace(str), "[") {
		var parsed []any
		if err := json.Unmarshal([]byte(str), &parsed); err == nil {
			return parsed
		}
	}
	return nil
}

func parseFloat(s string, fallback float64) float64 {
	f, err := strconv.ParseFloat(strings.TrimSpace(s), 64)
	if err != nil {
		return fallback
	}
	return f
}
