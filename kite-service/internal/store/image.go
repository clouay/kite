package store

import (
	"context"

	"github.com/kitecloud/kite/kite-service/internal/model"
)

type ImageTemplateStore interface {
	ImageTemplatesByApp(ctx context.Context, appID string) ([]*model.ImageTemplate, error)
	CountImageTemplatesByApp(ctx context.Context, appID string) (int, error)
	ImageTemplate(ctx context.Context, appID string, id string) (*model.ImageTemplate, error)
	CreateImageTemplate(ctx context.Context, template *model.ImageTemplate) (*model.ImageTemplate, error)
	UpdateImageTemplate(ctx context.Context, template *model.ImageTemplate) (*model.ImageTemplate, error)
	DeleteImageTemplate(ctx context.Context, appID string, id string) error
}
