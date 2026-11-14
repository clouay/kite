package image

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/golang/freetype/truetype"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/gofont/gobolditalic"
	"golang.org/x/image/font/gofont/goitalic"
	"golang.org/x/image/font/gofont/gomono"
	"golang.org/x/image/font/gofont/gomonobold"
	"golang.org/x/image/font/gofont/goregular"
)

var (
	fontOnce       sync.Once
	fontRegular    *truetype.Font
	fontBold       *truetype.Font
	fontItalic     *truetype.Font
	fontBoldItalic *truetype.Font
	fontMono       *truetype.Font
	fontMonoBold   *truetype.Font

	parsedFontsLock sync.RWMutex
	parsedFonts     = make(map[string]*truetype.Font)

	fallbackFontsLock sync.RWMutex
	fallbackFontsRegular []*truetype.Font
	fallbackFontsBold    []*truetype.Font
)

// tryLoadTTFFiles attempts to read and parse the first available TTF font from a slice of paths.
func tryLoadTTFFiles(paths []string) *truetype.Font {
	for _, p := range paths {
		if p == "" {
			continue
		}
		data, err := os.ReadFile(p)
		if err == nil && len(data) > 0 {
			if f, err := truetype.Parse(data); err == nil {
				return f
			}
		}
	}
	return nil
}

// getFontSearchDirs returns the candidate directories for finding bundled and system font files.
func getFontSearchDirs() []string {
	return []string{
		filepath.Join("pkg", "image", "fonts"),
		filepath.Join("..", "kite-service", "pkg", "image", "fonts"),
		filepath.Join("fonts"),
		`C:\Windows\Fonts`,
		`/usr/share/fonts/truetype`,
		`/usr/share/fonts/truetype/dejavu`,
	}
}

// getFontCandidates generates prioritized file path candidates for a given font base name and weight.
func getFontCandidates(fontBaseName string, bold bool) []string {
	var weightName string
	if bold {
		weightName = "700"
	} else {
		weightName = "400"
	}
	primary := fmt.Sprintf("%s-%s.ttf", fontBaseName, weightName)
	fallback := fmt.Sprintf("%s-400.ttf", fontBaseName)

	dirs := getFontSearchDirs()
	var res []string
	for _, d := range dirs {
		res = append(res, filepath.Join(d, primary))
		if bold {
			res = append(res, filepath.Join(d, fallback))
		}
		res = append(res, filepath.Join(d, fmt.Sprintf("%s.ttf", fontBaseName)))
	}
	return res
}

// initFonts performs one-time initialization of core fallback fonts and built-in fonts.
func initFonts() {
	fontOnce.Do(func() {
		var err error
		fontRegular = tryLoadTTFFiles([]string{
			filepath.Join("pkg", "image", "fonts", "Inter-400.ttf"),
			filepath.Join("..", "kite-service", "pkg", "image", "fonts", "Inter-400.ttf"),
			filepath.Join("..", "kite-web", "src", "lib", "og", "Inter-Regular.ttf"),
			filepath.Join("kite-web", "src", "lib", "og", "Inter-Regular.ttf"),
			`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`,
			`C:\Windows\Fonts\segoeui.ttf`,
			`C:\Windows\Fonts\arial.ttf`,
		})
		if fontRegular == nil {
			fontRegular, err = truetype.Parse(goregular.TTF)
			if err != nil {
				panic(fmt.Sprintf("failed to parse regular font: %v", err))
			}
		}

		fontBold = tryLoadTTFFiles([]string{
			filepath.Join("pkg", "image", "fonts", "Inter-700.ttf"),
			filepath.Join("..", "kite-service", "pkg", "image", "fonts", "Inter-700.ttf"),
			filepath.Join("..", "kite-web", "src", "lib", "og", "Inter-Bold.ttf"),
			filepath.Join("kite-web", "src", "lib", "og", "Inter-Bold.ttf"),
			`/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`,
			`C:\Windows\Fonts\segoeuib.ttf`,
			`C:\Windows\Fonts\arialbd.ttf`,
		})
		if fontBold == nil {
			fontBold, err = truetype.Parse(gobold.TTF)
			if err != nil {
				panic(fmt.Sprintf("failed to parse bold font: %v", err))
			}
		}

		fontItalic, _ = truetype.Parse(goitalic.TTF)
		fontBoldItalic, _ = truetype.Parse(gobolditalic.TTF)
		fontMono, _ = truetype.Parse(gomono.TTF)
		fontMonoBold, _ = truetype.Parse(gomonobold.TTF)

		loadGlobalFallbackFonts()
	})
}

// loadGlobalFallbackFonts initializes the universal multi-language and symbol fallback fonts chain.
func loadGlobalFallbackFonts() {
	fallbackFontNames := []struct {
		name       string
		allowBold  bool
		extraPaths []string
	}{
		// CJK (Japanese, Chinese, Korean, CJK Radicals & Numerals like 〢)
		{name: "NotoSansJP", allowBold: true},
		{name: "NotoSansSC", allowBold: false},
		{name: "NotoSansKR", allowBold: false},

		// Indic & Aesthetic Profile Scripts (Bengali for ৎ, Oriya for ୨୧, Gurmukhi for ੭, Telugu for ੀ, etc.)
		{name: "NotoSansBengali", allowBold: false},
		{name: "NotoSansDevanagari", allowBold: false},
		{name: "NotoSansOriya", allowBold: false},
		{name: "NotoSansGurmukhi", allowBold: false},
		{name: "NotoSansTelugu", allowBold: false},
		{name: "NotoSansTamil", allowBold: false},
		{
			name: "NotoSansGeorgian",
			allowBold: false,
			extraPaths: []string{`C:\Windows\Fonts\sylfaen.ttf`},
		},

		// Middle Eastern & Southeast Asian Scripts
		{name: "NotoSansArabic", allowBold: false},
		{name: "NotoSansHebrew", allowBold: false},
		{name: "NotoSansThai", allowBold: false},

		// Comprehensive Symbols, Math & Shapes (Dingbats, Stars ★, Hearts ♡♥, Runes, Music ♪)
		{name: "NotoSansSymbols", allowBold: false},
		{name: "NotoSansSymbols2", allowBold: false},
		{name: "NotoSansMath", allowBold: false},
		{
			name: "SegoeUISymbol",
			allowBold: false,
			extraPaths: []string{`C:\Windows\Fonts\seguisym.ttf`},
		},
		{
			name: "SegoeUIHistoric",
			allowBold: false,
			extraPaths: []string{`C:\Windows\Fonts\seguihis.ttf`},
		},

		// Emoji Coverage (💉, 🔥, ✨, 🎀, 💖, 🍓, 🌸, 🎂, etc.)
		{
			name: "SegoeUIEmoji",
			allowBold: false,
			extraPaths: []string{`C:\Windows\Fonts\seguiemj.ttf`},
		},
		{name: "NotoEmoji", allowBold: false},

		// Universal 100% Unicode BMP Fallback (covers all 65,536 Plane 0 codepoints)
		{name: "Unifont", allowBold: false},

		// System Fallbacks
		{
			name: "ArialUnicode",
			allowBold: false,
			extraPaths: []string{
				`C:\Windows\Fonts\arialuni.ttf`,
				`C:\Windows\Fonts\seguihis.ttf`,
				`C:\Windows\Fonts\segoeui.ttf`,
				`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`,
			},
		},
	}

	fallbackFontsLock.Lock()
	defer fallbackFontsLock.Unlock()

	fallbackFontsRegular = nil
	fallbackFontsBold = nil

	for _, spec := range fallbackFontNames {
		regCandidates := append(getFontCandidates(spec.name, false), spec.extraPaths...)
		if f := tryLoadTTFFiles(regCandidates); f != nil {
			fallbackFontsRegular = append(fallbackFontsRegular, f)
			if spec.allowBold {
				boldCandidates := append(getFontCandidates(spec.name, true), spec.extraPaths...)
				if fb := tryLoadTTFFiles(boldCandidates); fb != nil {
					fallbackFontsBold = append(fallbackFontsBold, fb)
				} else {
					fallbackFontsBold = append(fallbackFontsBold, f)
				}
			} else {
				fallbackFontsBold = append(fallbackFontsBold, f)
			}
		}
	}
}

// loadFont loads a primary font by family name, weight, and style, with caching.
func loadFont(family string, bold bool, italic bool) *truetype.Font {
	initFonts()
	famLower := strings.ToLower(strings.TrimSpace(family))
	cacheKey := fmt.Sprintf("%s-%t-%t", famLower, bold, italic)

	parsedFontsLock.RLock()
	cached, ok := parsedFonts[cacheKey]
	parsedFontsLock.RUnlock()
	if ok {
		return cached
	}

	var candidates []string
	switch {
	case strings.Contains(famLower, "bebas"):
		candidates = append(getFontCandidates("BebasNeue", bold),
			`/usr/share/fonts/truetype/msttcorefonts/Impact.ttf`,
			`C:\Windows\Fonts\impact.ttf`)
	case strings.Contains(famLower, "impact"):
		candidates = append(getFontCandidates("Impact", false),
			`C:\Windows\Fonts\impact.ttf`,
			`/usr/share/fonts/truetype/msttcorefonts/Impact.ttf`)
	case strings.Contains(famLower, "press start"):
		candidates = getFontCandidates("PressStart2P", false)
	case strings.Contains(famLower, "orbitron"):
		candidates = getFontCandidates("Orbitron", bold)
	case strings.Contains(famLower, "comic"):
		candidates = append(getFontCandidates("ComicNeue", bold),
			`C:\Windows\Fonts\comicbd.ttf`, `C:\Windows\Fonts\comic.ttf`)
	case strings.Contains(famLower, "playfair"):
		candidates = append(getFontCandidates("PlayfairDisplay", bold),
			`C:\Windows\Fonts\timesbd.ttf`, `C:\Windows\Fonts\times.ttf`)
	case strings.Contains(famLower, "merriweather"):
		candidates = append(getFontCandidates("Merriweather", bold),
			`/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf`,
			`C:\Windows\Fonts\timesbd.ttf`, `C:\Windows\Fonts\times.ttf`)
	case strings.Contains(famLower, "fira"):
		candidates = append(getFontCandidates("FiraCode", bold),
			`C:\Windows\Fonts\consolab.ttf`, `C:\Windows\Fonts\consola.ttf`)
	case strings.Contains(famLower, "jetbrains"):
		candidates = append(getFontCandidates("JetBrainsMono", bold),
			`C:\Windows\Fonts\consolab.ttf`, `C:\Windows\Fonts\consola.ttf`)
	case strings.Contains(famLower, "oswald"):
		candidates = getFontCandidates("Oswald", bold)
	case strings.Contains(famLower, "montserrat"):
		candidates = getFontCandidates("Montserrat", bold)
	case strings.Contains(famLower, "poppins"):
		candidates = getFontCandidates("Poppins", bold)
	case strings.Contains(famLower, "roboto"):
		candidates = append(getFontCandidates("Roboto", bold),
			`C:\Windows\Fonts\arialbd.ttf`, `C:\Windows\Fonts\arial.ttf`)
	case strings.Contains(famLower, "serif") || strings.Contains(famLower, "times"):
		if bold {
			candidates = append(getFontCandidates("Merriweather", true),
				`/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf`,
				`C:\Windows\Fonts\timesbd.ttf`, `C:\Windows\Fonts\times.ttf`)
		} else {
			candidates = append(getFontCandidates("Merriweather", false),
				`/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf`,
				`C:\Windows\Fonts\times.ttf`)
		}
	case strings.Contains(famLower, "mono") || strings.Contains(famLower, "consolas") || strings.Contains(famLower, "courier"):
		if bold {
			candidates = append(getFontCandidates("JetBrainsMono", true),
				getFontCandidates("FiraCode", true)...)
			candidates = append(candidates,
				`/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf`,
				`C:\Windows\Fonts\consolab.ttf`)
		} else {
			candidates = append(getFontCandidates("JetBrainsMono", false),
				getFontCandidates("FiraCode", false)...)
			candidates = append(candidates,
				`/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf`,
				`C:\Windows\Fonts\consola.ttf`)
		}
	default:
		// Default / Inter / sans-serif
		candidates = getFontCandidates("Inter", bold)
		if bold {
			candidates = append(candidates,
				filepath.Join("..", "kite-web", "src", "lib", "og", "Inter-Bold.ttf"),
				filepath.Join("kite-web", "src", "lib", "og", "Inter-Bold.ttf"),
				`/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf`,
				`C:\Windows\Fonts\segoeuib.ttf`,
				`C:\Windows\Fonts\arialbd.ttf`,
			)
		} else {
			candidates = append(candidates,
				filepath.Join("..", "kite-web", "src", "lib", "og", "Inter-Regular.ttf"),
				filepath.Join("kite-web", "src", "lib", "og", "Inter-Regular.ttf"),
				`/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf`,
				`C:\Windows\Fonts\segoeui.ttf`,
				`C:\Windows\Fonts\arial.ttf`,
			)
		}
	}

	foundFont := tryLoadTTFFiles(candidates)
	if foundFont == nil {
		if bold && italic && fontBoldItalic != nil {
			foundFont = fontBoldItalic
		} else if bold {
			foundFont = fontBold
		} else if italic && fontItalic != nil {
			foundFont = fontItalic
		} else {
			foundFont = fontRegular
		}
	}

	parsedFontsLock.Lock()
	parsedFonts[cacheKey] = foundFont
	parsedFontsLock.Unlock()

	return foundFont
}
