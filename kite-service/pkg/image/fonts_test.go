package image

import (
	"testing"

	"golang.org/x/image/font"
	"golang.org/x/image/math/fixed"
)

func TestFontRegistry(t *testing.T) {
	initFonts()

	// Test regular Inter loading
	interRegular := loadFont("Inter", false, false)
	if interRegular == nil {
		t.Fatalf("expected Inter regular font to be loaded")
	}

	// Test bold Inter loading
	interBold := loadFont("Inter", true, false)
	if interBold == nil {
		t.Fatalf("expected Inter bold font to be loaded")
	}

	// Test fallback fonts initialized
	fallbackFontsLock.RLock()
	nReg := len(fallbackFontsRegular)
	nBold := len(fallbackFontsBold)
	fallbackFontsLock.RUnlock()

	if nReg == 0 {
		t.Fatalf("expected fallbackFontsRegular to have entries, got 0")
	}
	t.Logf("Fallback fonts count: regular=%d, bold=%d", nReg, nBold)
}

func TestUniversalSymbolAndLanguageCoverage(t *testing.T) {
	initFonts()

	// 1. User's exact Discord profile username variations
	userDiscordNameGhan := ". ღ 飴(あめ) 〢 💉 。sgt"
	userDiscordNameKhanda := ". ৎ 飴(あめ) 〢 💉 。sgt"

	// 2. Additional popular aesthetic Discord symbols, kaomoji, and world scripts
	aestheticSymbols := "♡ ♥ ★ ✦ ♪ ║ ୨୧ ੭ ੀ ᰔ ꕤ ༺ ༻ ᐝ ✨ 🔥 🎀 💖 🌸 🍓"
	worldLanguages := "日本語 (Japanese) 中文 (Chinese) 한국어 (Korean) العربية (Arabic) ไทย (Thai) हिन्दी (Hindi)"

	testStrings := []struct {
		name string
		text string
	}{
		{"User Discord Username (Ghan)", userDiscordNameGhan},
		{"User Discord Username (Khanda)", userDiscordNameKhanda},
		{"Aesthetic Symbols & Emojis", aestheticSymbols},
		{"World Languages", worldLanguages},
	}

	for _, tc := range testStrings {
		t.Run(tc.name, func(t *testing.T) {
			face := newFontFace("Inter", false, false, 24)
			defer face.Close()

			adv := font.MeasureString(face, tc.text)
			if adv <= 0 {
				t.Fatalf("expected positive text advance for %s, got %v", tc.name, adv)
			}
			t.Logf("[%s] Advance: %.2fpx", tc.name, float64(adv)/64.0)

			// Render template with this text
			tplData := &ImageData{
				Layers: []Layer{
					{
						ID:       "bg",
						Type:     LayerTypeBackground,
						FillType: "solid",
						Color:    "#18181b",
						Width:    800,
						Height:   150,
						Opacity:  1,
						Visible:  true,
					},
					{
						ID:         "txt",
						Type:       LayerTypeText,
						Content:    tc.text,
						FontFamily: "Inter",
						FontSize:   24,
						FontWeight: "bold",
						Color:      "#ffffff",
						X:          30,
						Y:          40,
						Width:      740,
						Height:     80,
						Opacity:    1,
						Visible:    true,
					},
				},
			}

			pngBytes, err := RenderPNG(800, 150, tplData, map[string]any{})
			if err != nil {
				t.Fatalf("RenderPNG failed for %s: %v", tc.name, err)
			}
			if len(pngBytes) < 500 {
				t.Fatalf("RenderPNG produced suspiciously small output: %d bytes", len(pngBytes))
			}
			t.Logf("[%s] Successfully rendered PNG: %d bytes", tc.name, len(pngBytes))
		})
	}
}

func TestNoGlyphArtifactSuppression(t *testing.T) {
	face := newFontFace("Inter", false, false, 24)
	defer face.Close()

	// Test an unmapped private-use / undefined codepoint
	unmappedRune := rune(0xFFFF)

	mf, ok := face.(*multiFallbackFace)
	if !ok {
		t.Skip("not a multiFallbackFace")
	}

	_, found := mf.selectFace(unmappedRune)
	if found {
		t.Logf("rune 0xFFFF happened to be in a font")
	}

	// Glyph() should return ok=false for unmapped runes, suppressing the ugly .notdef outline
	_, _, _, _, glyphOk := mf.Glyph(fixed.Point26_6{}, unmappedRune)
	if glyphOk {
		t.Fatalf("expected Glyph to return ok=false for unmapped rune")
	}
}
