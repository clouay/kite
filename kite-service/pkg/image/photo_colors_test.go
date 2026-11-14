package image

import (
	"os"
	"testing"
)

func TestDynamicPhotoColorInjection(t *testing.T) {
	layers := []Layer{
		{
			ID:       "avatar-1",
			Type:     LayerTypeImage,
			ImageURL: "{{image_avatar}}",
			Width:    100,
			Height:   100,
		},
		{
			ID:        "bar-1",
			Type:      LayerTypeProgressBar,
			FillColor: "{{image_avatar.average}}",
			Value:     "50",
			MaxValue:  "100",
			Width:     200,
			Height:    20,
		},
	}
	vars := map[string]any{
		"image_avatar": DefaultPlaceholderPhoto,
	}

	calculateAndInjectPhotoColors(layers, vars)

	avgVal, ok := vars["image_avatar.average"].(string)
	if !ok || avgVal == "" {
		t.Fatalf("expected image_avatar.average in vars, got %v", vars["image_avatar.average"])
	}
	if avgVal[0] != '#' {
		t.Fatalf("expected hex color, got %s", avgVal)
	}

	domVal, ok := vars["image_avatar.dominant"].(string)
	if !ok || domVal == "" {
		t.Fatalf("expected image_avatar.dominant in vars, got %v", vars["image_avatar.dominant"])
	}

	invVal, ok := vars["image_avatar.inverse"].(string)
	if !ok || invVal == "" {
		t.Fatalf("expected image_avatar.inverse in vars, got %v", vars["image_avatar.inverse"])
	}

	domInvVal, ok := vars["image_avatar.dominant_inverse"].(string)
	if !ok || domInvVal == "" {
		t.Fatalf("expected image_avatar.dominant_inverse in vars, got %v", vars["image_avatar.dominant_inverse"])
	}

	t.Logf("Successfully injected photo colors: average=%s, dominant=%s, inverse=%s, dominant_inverse=%s", avgVal, domVal, invVal, domInvVal)

	imgData := &ImageData{
		Layers: layers,
	}

	res, mimeType, err := RenderImage(400, 200, "png", imgData, vars)
	if err != nil {
		t.Fatalf("RenderImage failed: %v", err)
	}
	if len(res) == 0 {
		t.Fatalf("rendered PNG was empty")
	}
	t.Logf("Rendered image with dynamic photo colors successfully: %d bytes (mime: %s)", len(res), mimeType)
}

func TestInversePhotoColorRender(t *testing.T) {
	layers := []Layer{
		{
			ID:              "bg",
			Type:            LayerTypeBackground,
			Visible:         true,
			FillColor:       "#18191c",
			Width:           600,
			Height:          240,
			BorderRadius:    20,
			BackgroundColor: "#18191c",
		},
		{
			ID:           "avatar",
			Type:         LayerTypeImage,
			Visible:      true,
			ImageURL:     "{{image_avatar}}",
			X:            420,
			Y:            35,
			Width:        150,
			Height:       150,
			BorderRadius: 75,
		},
		{
			ID:        "bar-dominant",
			Type:      LayerTypeProgressBar,
			Visible:   true,
			FillColor: "{{image_avatar.dominant}}",
			Value:     "80",
			MaxValue:  "100",
			X:         40,
			Y:         40,
			Width:     340,
			Height:    24,
		},
		{
			ID:        "bar-inverse",
			Type:      LayerTypeProgressBar,
			Visible:   true,
			FillColor: "{{image_avatar.inverse}}",
			Value:     "80",
			MaxValue:  "100",
			X:         40,
			Y:         80,
			Width:     340,
			Height:    24,
		},
		{
			ID:         "label-dom",
			Type:       LayerTypeText,
			Visible:    true,
			Content:    "Dominant Color",
			Color:      "{{image_avatar.dominant}}",
			FontSize:   22,
			FontWeight: "bold",
			X:          40,
			Y:          130,
		},
		{
			ID:         "label-inv",
			Type:       LayerTypeText,
			Visible:    true,
			Content:    "Inverse Color",
			Color:      "{{image_avatar.inverse}}",
			FontSize:   22,
			FontWeight: "bold",
			X:          40,
			Y:          170,
		},
	}

	vars := map[string]any{
		"image_avatar": DefaultPlaceholderPhoto,
	}

	imgData := &ImageData{
		Layers: layers,
	}

	res, _, err := RenderImage(600, 240, "png", imgData, vars)
	if err != nil {
		t.Fatalf("RenderImage failed: %v", err)
	}

	artifactPath := `C:\Users\Partl\.gemini\antigravity\brain\180e9733-aba5-4765-977a-3efee9adda38\test_inverse_card_rendered.png`
	if err := os.WriteFile(artifactPath, res, 0644); err != nil {
		t.Logf("Could not write artifact: %v", err)
	} else {
		t.Logf("Wrote artifact to %s", artifactPath)
	}
}

func TestMultiImageLayerColorDisambiguation(t *testing.T) {
	layers := []Layer{
		{
			ID:       "layer-1",
			Name:     "Image / Avatar",
			Type:     LayerTypeImage,
			ImageURL: "{{image_avatar}}",
		},
		{
			ID:       "layer-2",
			Name:     "Image / Avatar",
			Type:     LayerTypeImage,
			ImageURL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", // 1x1 red pixel
		},
	}

	vars := map[string]any{
		"image_avatar": DefaultPlaceholderPhoto,
	}

	calculateAndInjectPhotoColors(layers, vars)

	// Layer 1 checks
	if vars["image_avatar.dominant"] == nil {
		t.Fatalf("expected image_avatar.dominant to be set for layer 1")
	}
	if vars["image_1.dominant"] == nil {
		t.Fatalf("expected image_1.dominant to be set")
	}
	if vars["layer-1.dominant"] == nil {
		t.Fatalf("expected layer-1.dominant to be set")
	}

	// Layer 2 checks (disambiguated slug and index)
	if vars["image_avatar_2.dominant"] == nil {
		t.Fatalf("expected image_avatar_2.dominant to be set for layer 2")
	}
	if vars["image_2.dominant"] == nil {
		t.Fatalf("expected image_2.dominant to be set")
	}
	if vars["layer-2.dominant"] == nil {
		t.Fatalf("expected layer-2.dominant to be set")
	}

	t.Logf("Multi-image layer color disambiguation verified: layer1=%v, layer2=%v", vars["image_avatar.dominant"], vars["image_avatar_2.dominant"])
}