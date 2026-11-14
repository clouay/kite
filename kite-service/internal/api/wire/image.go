package wire

import (
	"time"

	"github.com/kitecloud/kite/kite-service/internal/model"
	"github.com/kitecloud/kite/kite-service/pkg/image"
	"gopkg.in/guregu/null.v4"
)

type ImageTemplate struct {
	ID          string          `json:"id"`
	AppID       string          `json:"app_id"`
	Name        string          `json:"name"`
	Description null.String     `json:"description"`
	Width       int             `json:"width"`
	Height      int             `json:"height"`
	Format      string          `json:"format"`
	Data        image.ImageData `json:"data"`
	SampleData  map[string]any  `json:"sample_data"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
}

type ImageTemplateListResponse = []*ImageTemplate

type ImageTemplateGetResponse = ImageTemplate

type ImageTemplateCreateRequest struct {
	Name        string          `json:"name"`
	Description null.String     `json:"description"`
	Width       int             `json:"width"`
	Height      int             `json:"height"`
	Format      string          `json:"format"`
	Data        image.ImageData `json:"data"`
	SampleData  map[string]any  `json:"sample_data"`
}

type ImageTemplateCreateResponse = ImageTemplate

type ImageTemplateUpdateRequest struct {
	Name        string          `json:"name"`
	Description null.String     `json:"description"`
	Width       int             `json:"width"`
	Height      int             `json:"height"`
	Format      string          `json:"format"`
	Data        image.ImageData `json:"data"`
	SampleData  map[string]any  `json:"sample_data"`
}

type ImageTemplateUpdateResponse = ImageTemplate

type ImageTemplateDeleteResponse = Empty

type ImageTemplateRenderPreviewRequest struct {
	Width      int             `json:"width"`
	Height     int             `json:"height"`
	Format     string          `json:"format"`
	Data       image.ImageData `json:"data"`
	SampleData map[string]any  `json:"sample_data"`
}

type ImageTemplateRenderPreviewResponse struct {
	DataURL string `json:"data_url"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
	Format  string `json:"format"`
}

type ImageExtractColorsRequest struct {
	URL string `json:"url"`
}

type ImageExtractColorsResponse struct {
	Dominant        string `json:"dominant"`
	Average         string `json:"average"`
	Inverse         string `json:"inverse"`
	DominantInverse string `json:"dominant_inverse"`
}

func ImageTemplateToWire(t *model.ImageTemplate) *ImageTemplate {
	if t == nil {
		return nil
	}
	return &ImageTemplate{
		ID:          t.ID,
		AppID:       t.AppID,
		Name:        t.Name,
		Description: t.Description,
		Width:       t.Width,
		Height:      t.Height,
		Format:      t.Format,
		Data:        t.Data,
		SampleData:  t.SampleData,
		CreatedAt:   t.CreatedAt,
		UpdatedAt:   t.UpdatedAt,
	}
}
