package image

import (
	"image"

	"github.com/golang/freetype/truetype"
	"golang.org/x/image/font"
	"golang.org/x/image/math/fixed"
)

// fallbackFaceItem pairs a loaded truetype font with its instantiated font.Face.
type fallbackFaceItem struct {
	font *truetype.Font
	face font.Face
}

// multiFallbackFace chains a primary font face with an ordered slice of fallback faces.
// It handles missing glyph routing and prevents ugly ".notdef" (e.g. Inter's "NO GLYPH" box) artifacts.
type multiFallbackFace struct {
	primaryFont *truetype.Font
	primaryFace font.Face
	fallbacks   []fallbackFaceItem
}

// selectFace returns the appropriate font.Face that contains a non-zero glyph for the given rune.
// If no font contains the rune, it returns the primary face and false.
func (m *multiFallbackFace) selectFace(r rune) (font.Face, bool) {
	if m.primaryFont != nil && m.primaryFont.Index(r) != 0 {
		return m.primaryFace, true
	}
	for _, fb := range m.fallbacks {
		if fb.font != nil && fb.font.Index(r) != 0 {
			return fb.face, true
		}
	}
	return m.primaryFace, false
}

// Glyph returns the bounding box, mask, advance, and existence status of a rune glyph.
// If the rune is not supported in any font, it gracefully returns ok=false to prevent
// drawing ugly missing glyph boxes.
func (m *multiFallbackFace) Glyph(dot fixed.Point26_6, r rune) (dr image.Rectangle, mask image.Image, maskp image.Point, advance fixed.Int26_6, ok bool) {
	face, found := m.selectFace(r)
	if !found {
		adv, _ := m.primaryFace.GlyphAdvance(' ')
		return image.Rectangle{}, nil, image.Point{}, adv, false
	}
	return face.Glyph(dot, r)
}

// GlyphBounds returns the bounding box of the glyph for the given rune.
func (m *multiFallbackFace) GlyphBounds(r rune) (bounds fixed.Rectangle26_6, advance fixed.Int26_6, ok bool) {
	face, found := m.selectFace(r)
	if !found {
		adv, _ := m.primaryFace.GlyphAdvance(' ')
		return fixed.Rectangle26_6{}, adv, false
	}
	return face.GlyphBounds(r)
}

// GlyphAdvance returns the advance width for the given rune.
func (m *multiFallbackFace) GlyphAdvance(r rune) (advance fixed.Int26_6, ok bool) {
	face, found := m.selectFace(r)
	if !found {
		return m.primaryFace.GlyphAdvance(' ')
	}
	return face.GlyphAdvance(r)
}

// Kern returns the kerning distance between two runes using the primary font.
func (m *multiFallbackFace) Kern(r0, r1 rune) fixed.Int26_6 {
	return m.primaryFace.Kern(r0, r1)
}

// Metrics returns the font metrics of the primary font face.
func (m *multiFallbackFace) Metrics() font.Metrics {
	return m.primaryFace.Metrics()
}

// Close releases resources associated with the primary face and all fallback faces.
func (m *multiFallbackFace) Close() error {
	_ = m.primaryFace.Close()
	for _, fb := range m.fallbacks {
		_ = fb.face.Close()
	}
	return nil
}

// newFontFace creates a new font.Face for the current goroutine with universal multi-language, symbol, and emoji fallbacks.
// Note: font.Face is stateful and must NOT be shared across concurrent goroutines.
func newFontFace(family string, bold bool, italic bool, size float64) font.Face {
	initFonts()
	if size <= 4 {
		size = 14
	}
	if size > 400 {
		size = 400
	}
	fnt := loadFont(family, bold, italic)
	opts := &truetype.Options{
		Size:    size,
		DPI:     72,
		Hinting: font.HintingNone,
	}
	primaryFace := truetype.NewFace(fnt, opts)

	fallbackFontsLock.RLock()
	var fList []*truetype.Font
	if bold {
		fList = fallbackFontsBold
	} else {
		fList = fallbackFontsRegular
	}
	targets := make([]*truetype.Font, len(fList))
	copy(targets, fList)
	fallbackFontsLock.RUnlock()

	var fallbacks []fallbackFaceItem
	for _, fbFont := range targets {
		if fbFont != nil && fbFont != fnt {
			fallbacks = append(fallbacks, fallbackFaceItem{
				font: fbFont,
				face: truetype.NewFace(fbFont, opts),
			})
		}
	}

	if len(fallbacks) == 0 {
		return primaryFace
	}

	return &multiFallbackFace{
		primaryFont: fnt,
		primaryFace: primaryFace,
		fallbacks:   fallbacks,
	}
}
