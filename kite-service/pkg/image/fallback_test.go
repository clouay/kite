package image

import (
	"path/filepath"
	"testing"

	"github.com/fogleman/gg"
	"golang.org/x/image/font"
)

func TestJapaneseFontFallback(t *testing.T) {
	interFont := tryLoadTTFFiles([]string{
		filepath.Join("fonts", "Inter-400.ttf"),
		filepath.Join("..", "kite-service", "pkg", "image", "fonts", "Inter-400.ttf"),
	})
	if interFont == nil {
		t.Fatalf("failed to load Inter-400.ttf")
	}

	jpFont := tryLoadTTFFiles([]string{
		filepath.Join("fonts", "NotoSansJP-400.ttf"),
		filepath.Join("..", "kite-service", "pkg", "image", "fonts", "NotoSansJP-400.ttf"),
	})
	if jpFont == nil {
		t.Fatalf("failed to load NotoSansJP-400.ttf")
	}

	// Check that Inter has no glyph for '日' (glyph index 0)
	if interFont.Index('日') != 0 {
		t.Errorf("expected Inter to have 0 for '日', got %d", interFont.Index('日'))
	}
	// Check that NotoSansJP has a glyph for '日' (glyph index > 0)
	if jpFont.Index('日') == 0 {
		t.Errorf("expected NotoSansJP to have >0 for '日', got 0")
	}

	testText := "テスト(test)日. sgt"

	// Test directly using newFontFace which auto-fallbacks
	face := newFontFace("Inter", false, false, 32)
	adv := font.MeasureString(face, testText)
	if adv <= 0 {
		t.Fatalf("expected positive advance from newFontFace, got %v", adv)
	}

	dc := gg.NewContext(400, 100)
	dc.SetFontFace(face)
	dc.SetRGB(1, 1, 1)
	dc.DrawString(testText, 20, 50)

	t.Logf("Measured text '%s': advance = %v", testText, float64(adv)/64.0)
}

func TestJapaneseFullTemplateRender(t *testing.T) {
	data := &ImageData{
		Layers: []Layer{
			{
				ID:       "bg",
				Type:     LayerTypeBackground,
				FillType: "solid",
				Color:    "#1e1f22",
				Width:    600,
				Height:   240,
				Opacity:  1,
				Visible:  true,
			},
			{
				ID:         "username",
				Type:       LayerTypeText,
				Content:    "テスト(test)日. sgt",
				FontFamily: "Inter",
				FontSize:   28,
				FontWeight: "bold",
				Color:      "#ffffff",
				X:          50,
				Y:          80,
				Width:      400,
				Height:     50,
				Opacity:    1,
				Visible:    true,
			},
		},
	}

	pngBytes, err := RenderPNG(600, 240, data, map[string]any{})
	if err != nil {
		t.Fatalf("RenderPNG failed with Japanese text: %v", err)
	}
	if len(pngBytes) < 500 {
		t.Fatalf("expected valid PNG output, got %d bytes", len(pngBytes))
	}
	t.Logf("Successfully rendered Japanese template: %d bytes", len(pngBytes))
}

func TestSolidVsGradientPreservation(t *testing.T) {
	// A layer that has BOTH a gradient and a solid color configured,
	// toggling FillType should determine whether solid or gradient is drawn.
	data := &ImageData{
		Layers: []Layer{
			{
				ID:       "bg",
				Type:     LayerTypeBackground,
				FillType: "solid",
				Color:    "#112233",
				Gradient: &Gradient{
					Angle: 90,
					Stops: []GradientStop{
						{Offset: 0, Color: "#ff0000"},
						{Offset: 100, Color: "#0000ff"},
					},
				},
				Width:   400,
				Height:  200,
				Opacity: 1,
				Visible: true,
			},
		},
	}

	solidBytes, err := RenderPNG(400, 200, data, nil)
	if err != nil {
		t.Fatalf("Failed to render solid: %v", err)
	}

	// Now switch FillType to linear-gradient without modifying Gradient or Color
	data.Layers[0].FillType = "linear-gradient"
	gradBytes, err := RenderPNG(400, 200, data, nil)
	if err != nil {
		t.Fatalf("Failed to render gradient: %v", err)
	}

	if len(solidBytes) == len(gradBytes) {
		t.Fatalf("expected solid and gradient PNG outputs to differ in size/compression")
	}
	t.Logf("Solid size: %d bytes, Gradient size: %d bytes", len(solidBytes), len(gradBytes))
}
