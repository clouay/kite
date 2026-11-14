package image

import (
	"encoding/json"
	"testing"
)

func TestProgressBarSolidVsGradient(t *testing.T) {
	// Template with solid bar (fill_color: #a855f7, fill_gradient present but fill_type is NOT gradient)
	solidJSON := `{
		"layers": [
			{"x": 0, "y": 0, "id": "bar", "type": "progress_bar", "value": "50", "max_value": "100", "width": 200, "height": 20, "fill_color": "#a855f7", "fill_gradient": {"stops": [{"color": "#8b5cf6", "offset": 0}, {"color": "#ec4899", "offset": 1}]}}
		]
	}`

	var solidData ImageData
	if err := json.Unmarshal([]byte(solidJSON), &solidData); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	solidPNG, err := RenderPNG(200, 20, &solidData, nil)
	if err != nil {
		t.Fatalf("render solid failed: %v", err)
	}
	if len(solidPNG) == 0 {
		t.Fatalf("empty png")
	}

	// Now set fill_type to gradient
	gradJSON := `{
		"layers": [
			{"x": 0, "y": 0, "id": "bar", "type": "progress_bar", "fill_type": "gradient", "value": "50", "max_value": "100", "width": 200, "height": 20, "fill_color": "#a855f7", "fill_gradient": {"stops": [{"color": "#8b5cf6", "offset": 0}, {"color": "#ec4899", "offset": 1}]}}
		]
	}`
	var gradData ImageData
	if err := json.Unmarshal([]byte(gradJSON), &gradData); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}

	gradPNG, err := RenderPNG(200, 20, &gradData, nil)
	if err != nil {
		t.Fatalf("render gradient failed: %v", err)
	}
	if len(gradPNG) == 0 {
		t.Fatalf("empty grad png")
	}

	t.Logf("Solid PNG size: %d, Gradient PNG size: %d", len(solidPNG), len(gradPNG))
}
