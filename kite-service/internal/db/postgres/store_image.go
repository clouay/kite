package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/kitecloud/kite/kite-service/internal/db/postgres/pgmodel"
	"github.com/kitecloud/kite/kite-service/internal/model"
	"github.com/kitecloud/kite/kite-service/internal/store"
	"github.com/kitecloud/kite/kite-service/pkg/image"
	"gopkg.in/guregu/null.v4"
)

func (c *Client) ImageTemplatesByApp(ctx context.Context, appID string) ([]*model.ImageTemplate, error) {
	rows, err := c.Q.GetImageTemplatesByApp(ctx, appID)
	if err != nil {
		return nil, err
	}

	templates := make([]*model.ImageTemplate, len(rows))
	for i, row := range rows {
		tmpl, err := rowToImageTemplate(row)
		if err != nil {
			return nil, err
		}
		templates[i] = tmpl
	}

	return templates, nil
}

func (c *Client) CountImageTemplatesByApp(ctx context.Context, appID string) (int, error) {
	res, err := c.Q.CountImageTemplatesByApp(ctx, appID)
	if err != nil {
		return 0, err
	}
	return int(res), nil
}

func (c *Client) ImageTemplate(ctx context.Context, appID string, id string) (*model.ImageTemplate, error) {
	row, err := c.Q.GetImageTemplate(ctx, pgmodel.GetImageTemplateParams{
		ID:    id,
		AppID: appID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	return rowToImageTemplate(row)
}

func (c *Client) CreateImageTemplate(ctx context.Context, template *model.ImageTemplate) (*model.ImageTemplate, error) {
	dataRaw, err := json.Marshal(template.Data)
	if err != nil {
		return nil, err
	}

	sampleRaw, err := json.Marshal(template.SampleData)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	row, err := c.Q.CreateImageTemplate(ctx, pgmodel.CreateImageTemplateParams{
		ID:            template.ID,
		AppID:         template.AppID,
		Name:          template.Name,
		Description:   pgtype.Text{String: template.Description.String, Valid: template.Description.Valid},
		CreatorUserID: pgtype.Text{String: template.CreatorUserID.String, Valid: template.CreatorUserID.Valid},
		Width:         int32(template.Width),
		Height:        int32(template.Height),
		Format:        template.Format,
		Data:          dataRaw,
		SampleData:    sampleRaw,
		CreatedAt:     pgtype.Timestamp{Time: now, Valid: true},
		UpdatedAt:     pgtype.Timestamp{Time: now, Valid: true},
	})
	if err != nil {
		return nil, err
	}

	return rowToImageTemplate(row)
}

func (c *Client) UpdateImageTemplate(ctx context.Context, template *model.ImageTemplate) (*model.ImageTemplate, error) {
	dataRaw, err := json.Marshal(template.Data)
	if err != nil {
		return nil, err
	}

	sampleRaw, err := json.Marshal(template.SampleData)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	row, err := c.Q.UpdateImageTemplate(ctx, pgmodel.UpdateImageTemplateParams{
		ID:          template.ID,
		AppID:       template.AppID,
		Name:        template.Name,
		Description: pgtype.Text{String: template.Description.String, Valid: template.Description.Valid},
		Width:       int32(template.Width),
		Height:      int32(template.Height),
		Format:      template.Format,
		Data:        dataRaw,
		SampleData:  sampleRaw,
		UpdatedAt:   pgtype.Timestamp{Time: now, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, store.ErrNotFound
		}
		return nil, err
	}

	return rowToImageTemplate(row)
}

func (c *Client) DeleteImageTemplate(ctx context.Context, appID string, id string) error {
	_, err := c.Q.DeleteImageTemplate(ctx, pgmodel.DeleteImageTemplateParams{
		ID:    id,
		AppID: appID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return store.ErrNotFound
		}
		return err
	}
	return nil
}

func rowToImageTemplate(row pgmodel.ImageTemplate) (*model.ImageTemplate, error) {
	var data image.ImageData
	if len(row.Data) > 0 {
		if err := json.Unmarshal(row.Data, &data); err != nil {
			return nil, err
		}
	}

	var sampleData map[string]any
	if len(row.SampleData) > 0 {
		if err := json.Unmarshal(row.SampleData, &sampleData); err != nil {
			sampleData = make(map[string]any)
		}
	} else {
		sampleData = make(map[string]any)
	}

	return &model.ImageTemplate{
		ID:            row.ID,
		AppID:         row.AppID,
		Name:          row.Name,
		Description:   null.NewString(row.Description.String, row.Description.Valid),
		CreatorUserID: null.NewString(row.CreatorUserID.String, row.CreatorUserID.Valid),
		Width:         int(row.Width),
		Height:        int(row.Height),
		Format:        row.Format,
		Data:          data,
		SampleData:    sampleData,
		CreatedAt:     row.CreatedAt.Time,
		UpdatedAt:     row.UpdatedAt.Time,
	}, nil
}
