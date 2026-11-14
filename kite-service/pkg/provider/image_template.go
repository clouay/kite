package provider

import (
	"context"

	"github.com/kitecloud/kite/kite-service/pkg/image"
)

type ImageTemplateProvider interface {
	ImageTemplate(ctx context.Context, id string) (*image.ImageTemplateData, error)
}

type MockImageTemplateProvider struct{}

func (p *MockImageTemplateProvider) ImageTemplate(ctx context.Context, id string) (*image.ImageTemplateData, error) {
	return nil, nil
}
