package image

import (
	"encoding/json"
)

const (
	MaxCanvasDimension = 2560
	MinCanvasDimension = 16
	MaxLayers          = 60
)

type ImageFormat string

const (
	ImageFormatPNG  ImageFormat = "png"
	ImageFormatWebP ImageFormat = "webp"
	ImageFormatJPEG ImageFormat = "jpeg"
)

type LayerType string

const (
	LayerTypeBackground  LayerType = "background"
	LayerTypeShape       LayerType = "shape"
	LayerTypeText        LayerType = "text"
	LayerTypeImage       LayerType = "image"
	LayerTypeProgressBar LayerType = "progress_bar"
	LayerTypeBadge       LayerType = "badge"
	LayerTypeRepeater    LayerType = "repeater"
)

type GradientStop struct {
	Offset float64 `json:"offset"`
	Color  string  `json:"color"`
}

type Gradient struct {
	Angle float64        `json:"angle"`
	Stops []GradientStop `json:"stops"`
}

type RepeaterTemplate struct {
	ShowRank           bool   `json:"show_rank"`
	RankColor          string `json:"rank_color,omitempty"`
	ShowAvatar         bool   `json:"show_avatar"`
	AvatarField        string `json:"avatar_field,omitempty"`
	NameField          string `json:"name_field,omitempty"`
	NameColor          string `json:"name_color,omitempty"`
	ScoreField         string `json:"score_field,omitempty"`
	ScoreColor         string `json:"score_color,omitempty"`
	RowBackgroundColor string `json:"row_background_color,omitempty"`
	AlternateRowColor  string `json:"alternate_row_color,omitempty"`
	BorderRadius       int    `json:"border_radius,omitempty"`
}

type Layer struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Type      LayerType `json:"type"`
	Visible   bool      `json:"visible"`
	Locked    bool      `json:"locked,omitempty"`
	IsDynamic bool      `json:"is_dynamic,omitempty"`
	ShapeType string    `json:"shape_type,omitempty"`
	Freeform  bool      `json:"freeform,omitempty"`
	ShowIf    string    `json:"show_if,omitempty"`
	X         float64   `json:"x"`
	Y         float64   `json:"y"`
	Width     float64   `json:"width"`
	Height    float64   `json:"height"`
	Rotation  float64   `json:"rotation,omitempty"`
	Opacity   float64   `json:"opacity"`

	FillType     string    `json:"fill_type,omitempty"`
	Color        string    `json:"color,omitempty"`
	Gradient     *Gradient `json:"gradient,omitempty"`
	ImageURL     string    `json:"image_url,omitempty"`
	ObjectFit    string    `json:"object_fit,omitempty"`
	Blur         float64   `json:"blur,omitempty"`
	BackdropBlur float64   `json:"backdrop_blur,omitempty"`
	OverlayColor string    `json:"overlay_color,omitempty"`
	StatusValue      string    `json:"status_value,omitempty"`
	AvatarDecoration string    `json:"avatar_decoration,omitempty"`

	Content       string  `json:"content,omitempty"`
	FontFamily    string  `json:"font_family,omitempty"`
	FontSize      float64 `json:"font_size,omitempty"`
	FontWeight    string  `json:"font_weight,omitempty"`
	FontStyle     string  `json:"font_style,omitempty"`
	TextAlign     string  `json:"text_align,omitempty"`
	VerticalAlign string  `json:"vertical_align,omitempty"`
	TextTransform string  `json:"text_transform,omitempty"`
	LineHeight    float64 `json:"line_height,omitempty"`
	LetterSpacing float64 `json:"letter_spacing,omitempty"`
	AutoFit       bool    `json:"auto_fit,omitempty"`
	Truncate      bool    `json:"truncate,omitempty"`
	StrokeColor   string  `json:"stroke_color,omitempty"`
	StrokeWidth   float64 `json:"stroke_width,omitempty"`
	ShadowColor   string  `json:"shadow_color,omitempty"`
	ShadowBlur    float64 `json:"shadow_blur,omitempty"`
	ShadowMode    string  `json:"shadow_mode,omitempty"`

	Mask         string  `json:"mask,omitempty"`
	BorderRadius float64 `json:"border_radius,omitempty"`
	BorderWidth  float64 `json:"border_width,omitempty"`
	BorderColor  string  `json:"border_color,omitempty"`
	BorderMode   string  `json:"border_mode,omitempty"`

	Value           string    `json:"value,omitempty"`
	MaxValue        string    `json:"max_value,omitempty"`
	ProgressStyle   string    `json:"progress_style,omitempty"`
	FillColor       string    `json:"fill_color,omitempty"`
	FillGradient    *Gradient `json:"fill_gradient,omitempty"`
	BackgroundColor string    `json:"background_color,omitempty"`
	ShowText        bool      `json:"show_text,omitempty"`
	TextColor       string    `json:"text_color,omitempty"`

	Label string `json:"label,omitempty"`
	Icon  string `json:"icon,omitempty"`

	ItemsExpression string            `json:"items_expression,omitempty"`
	MaxItems        int               `json:"max_items,omitempty"`
	ItemHeight      float64           `json:"item_height,omitempty"`
	Gap             float64           `json:"gap,omitempty"`
	Direction       string            `json:"direction,omitempty"`
	ItemTemplate    *RepeaterTemplate `json:"item_template,omitempty"`
}

type ImageData struct {
	Version      int     `json:"version,omitempty"`
	BorderRadius float64 `json:"border_radius,omitempty"`
	Layers       []Layer `json:"layers"`
}

func (d *ImageData) UnmarshalJSON(b []byte) error {
	type rawImageData ImageData
	if err := json.Unmarshal(b, (*rawImageData)(d)); err != nil {
		return err
	}
	if d.Layers == nil {
		d.Layers = make([]Layer, 0)
	}
	return nil
}

type ImageTemplateData struct {
	Width      int            `json:"width"`
	Height     int            `json:"height"`
	Format     string         `json:"format,omitempty"`
	Data       ImageData      `json:"data"`
	SampleData map[string]any `json:"sample_data,omitempty"`
}

func ClampDimensions(w, h int) (int, int) {
	if w <= 0 {
		w = 800
	}
	if h <= 0 {
		h = 400
	}
	if w < MinCanvasDimension {
		w = MinCanvasDimension
	}
	if h < MinCanvasDimension {
		h = MinCanvasDimension
	}
	if w > MaxCanvasDimension {
		w = MaxCanvasDimension
	}
	if h > MaxCanvasDimension {
		h = MaxCanvasDimension
	}
	return w, h
}
