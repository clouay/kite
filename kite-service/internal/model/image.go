package model

import (
	"time"

	"github.com/kitecloud/kite/kite-service/pkg/image"
	"gopkg.in/guregu/null.v4"
)

type ImageTemplate struct {
	ID            string
	AppID         string
	Name          string
	Description   null.String
	CreatorUserID null.String
	Width         int
	Height        int
	Format        string
	Data          image.ImageData
	SampleData    map[string]any
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
