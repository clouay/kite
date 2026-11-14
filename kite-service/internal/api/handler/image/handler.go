package image

import (
	"encoding/base64"
	"fmt"
	"time"

	"github.com/kitecloud/kite/kite-service/internal/api/handler"
	"github.com/kitecloud/kite/kite-service/internal/api/wire"
	"github.com/kitecloud/kite/kite-service/internal/model"
	"github.com/kitecloud/kite/kite-service/internal/store"
	"github.com/kitecloud/kite/kite-service/internal/util"
	pkgimage "github.com/kitecloud/kite/kite-service/pkg/image"
	"gopkg.in/guregu/null.v4"
)

type ImageHandler struct {
	imageStore store.ImageTemplateStore
}

func NewImageHandler(imageStore store.ImageTemplateStore) *ImageHandler {
	return &ImageHandler{
		imageStore: imageStore,
	}
}

func (h *ImageHandler) HandleImageTemplateList(c *handler.Context) (*wire.ImageTemplateListResponse, error) {
	templates, err := h.imageStore.ImageTemplatesByApp(c.Context(), c.App.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get image templates: %w", err)
	}

	res := make([]*wire.ImageTemplate, len(templates))
	for i, tmpl := range templates {
		res[i] = wire.ImageTemplateToWire(tmpl)
	}

	return &res, nil
}

func (h *ImageHandler) HandleImageTemplateGet(c *handler.Context) (*wire.ImageTemplateGetResponse, error) {
	templateID := c.Param("imageID")
	tmpl, err := h.imageStore.ImageTemplate(c.Context(), c.App.ID, templateID)
	if err != nil {
		return nil, err
	}
	return wire.ImageTemplateToWire(tmpl), nil
}

func (h *ImageHandler) HandleImageTemplateCreate(c *handler.Context, req wire.ImageTemplateCreateRequest) (*wire.ImageTemplateCreateResponse, error) {
	width, height := pkgimage.ClampDimensions(req.Width, req.Height)
	format := req.Format
	if format == "" {
		format = "png"
	}
	if len(req.Data.Layers) > pkgimage.MaxLayers {
		req.Data.Layers = req.Data.Layers[:pkgimage.MaxLayers]
	}

	var creatorID null.String
	if c.Session != nil && c.Session.UserID != "" {
		creatorID = null.StringFrom(c.Session.UserID)
	}

	tmpl, err := h.imageStore.CreateImageTemplate(c.Context(), &model.ImageTemplate{
		ID:            util.UniqueID(),
		AppID:         c.App.ID,
		Name:          req.Name,
		Description:   req.Description,
		CreatorUserID: creatorID,
		Width:         width,
		Height:        height,
		Format:        format,
		Data:          req.Data,
		SampleData:    req.SampleData,
		CreatedAt:     time.Now().UTC(),
		UpdatedAt:     time.Now().UTC(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create image template: %w", err)
	}

	return wire.ImageTemplateToWire(tmpl), nil
}

func (h *ImageHandler) HandleImageTemplateUpdate(c *handler.Context, req wire.ImageTemplateUpdateRequest) (*wire.ImageTemplateUpdateResponse, error) {
	templateID := c.Param("imageID")
	width, height := pkgimage.ClampDimensions(req.Width, req.Height)
	format := req.Format
	if format == "" {
		format = "png"
	}
	if len(req.Data.Layers) > pkgimage.MaxLayers {
		req.Data.Layers = req.Data.Layers[:pkgimage.MaxLayers]
	}

	tmpl, err := h.imageStore.UpdateImageTemplate(c.Context(), &model.ImageTemplate{
		ID:          templateID,
		AppID:       c.App.ID,
		Name:        req.Name,
		Description: req.Description,
		Width:       width,
		Height:      height,
		Format:      format,
		Data:        req.Data,
		SampleData:  req.SampleData,
		UpdatedAt:   time.Now().UTC(),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to update image template: %w", err)
	}

	return wire.ImageTemplateToWire(tmpl), nil
}

func (h *ImageHandler) HandleImageTemplateDelete(c *handler.Context) (*wire.ImageTemplateDeleteResponse, error) {
	templateID := c.Param("imageID")
	if err := h.imageStore.DeleteImageTemplate(c.Context(), c.App.ID, templateID); err != nil {
		return nil, fmt.Errorf("failed to delete image template: %w", err)
	}
	return &wire.ImageTemplateDeleteResponse{}, nil
}

func (h *ImageHandler) HandleImageTemplateRenderPreview(c *handler.Context, req wire.ImageTemplateRenderPreviewRequest) (*wire.ImageTemplateRenderPreviewResponse, error) {
	width, height := pkgimage.ClampDimensions(req.Width, req.Height)
	format := req.Format
	if format == "" {
		format = "png"
	}

	imgBytes, ext, err := pkgimage.RenderImage(width, height, format, &req.Data, req.SampleData)
	if err != nil {
		return nil, fmt.Errorf("failed to render preview: %w", err)
	}

	mimeType := "image/png"
	if ext == "jpg" {
		mimeType = "image/jpeg"
	}
	dataURL := fmt.Sprintf("data:%s;base64,%s", mimeType, base64.StdEncoding.EncodeToString(imgBytes))

	return &wire.ImageTemplateRenderPreviewResponse{
		DataURL: dataURL,
		Width:   width,
		Height:  height,
		Format:  ext,
	}, nil
}

func (h *ImageHandler) HandleImageExtractColors(c *handler.Context, req wire.ImageExtractColorsRequest) (*wire.ImageExtractColorsResponse, error) {
	dom, avg, inv, domInv := pkgimage.ExtractImageColors(req.URL)
	return &wire.ImageExtractColorsResponse{
		Dominant:        dom,
		Average:         avg,
		Inverse:         inv,
		DominantInverse: domInv,
	}, nil
}
