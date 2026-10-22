package appsecret

import (
	"errors"
	"fmt"
	"time"

	"github.com/kitecloud/kite/kite-service/internal/api/handler"
	"github.com/kitecloud/kite/kite-service/internal/api/wire"
	"github.com/kitecloud/kite/kite-service/internal/model"
	"github.com/kitecloud/kite/kite-service/internal/store"
	"github.com/kitecloud/kite/kite-service/internal/util"
	"gopkg.in/guregu/null.v4"
)

type AppSecretHandler struct {
	appSecretStore store.AppSecretStore
	tokenCrypt     *util.SymmetricCrypt
}

func NewAppSecretHandler(appSecretStore store.AppSecretStore, tokenCrypt *util.SymmetricCrypt) *AppSecretHandler {
	return &AppSecretHandler{
		appSecretStore: appSecretStore,
		tokenCrypt:     tokenCrypt,
	}
}

func (h *AppSecretHandler) toWire(secret *model.AppSecret) (*wire.AppSecret, error) {
	if secret == nil {
		return nil, nil
	}

	var decrypted null.String
	if !secret.IsSecret && secret.ValueEncrypted != "" {
		val, err := h.tokenCrypt.DecryptString(secret.ValueEncrypted)
		if err != nil {
			return nil, fmt.Errorf("failed to decrypt non-secret value: %w", err)
		}
		decrypted = null.NewString(val, true)
	}

	return wire.AppSecretToWire(secret, decrypted), nil
}

func (h *AppSecretHandler) HandleAppSecretList(c *handler.Context) (*wire.AppSecretListResponse, error) {
	secrets, err := h.appSecretStore.AppSecretsByApp(c.Context(), c.App.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get secrets: %w", err)
	}

	res := make([]*wire.AppSecret, len(secrets))
	for i, secret := range secrets {
		w, err := h.toWire(secret)
		if err != nil {
			return nil, err
		}
		res[i] = w
	}
	return &res, nil
}

func (h *AppSecretHandler) HandleAppSecretCreate(c *handler.Context, req wire.AppSecretCreateRequest) (*wire.AppSecretCreateResponse, error) {
	if c.Features.MaxSecrets != 0 {
		count, err := h.appSecretStore.CountAppSecretsByApp(c.Context(), c.App.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to count secrets: %w", err)
		}
		if count >= c.Features.MaxSecrets {
			return nil, handler.ErrBadRequest("resource_limit", fmt.Sprintf("maximum number of secrets (%d) reached", c.Features.MaxSecrets))
		}
	}

	isSecret := true
	if req.IsSecret != nil {
		isSecret = *req.IsSecret
	}

	var value string
	if req.Value != "" {
		var err error
		value, err = h.tokenCrypt.EncryptString(req.Value)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt secret: %w", err)
		}
	}

	secret, err := h.appSecretStore.CreateAppSecret(c.Context(), &model.AppSecret{
		ID:             util.UniqueID(),
		AppID:          c.App.ID,
		CommandID:       req.CommandID.String,
		EventListenerID: req.EventListenerID.String,
		Name:           req.Name,
		IsSecret:       isSecret,
		ValueEncrypted: value,
		CreatedAt:      time.Now().UTC(),
		UpdatedAt:      time.Now().UTC(),
	})
	if err != nil {
		if errors.Is(err, store.ErrAlreadyExists) {
			return nil, handler.ErrBadRequest("duplicate_name", "A secret with this name already exists")
		}
		return nil, fmt.Errorf("failed to create secret: %w", err)
	}

	return h.toWire(secret)
}

func (h *AppSecretHandler) HandleAppSecretUpdate(c *handler.Context, req wire.AppSecretUpdateRequest) (*wire.AppSecretUpdateResponse, error) {
	secret, err := h.appSecretStore.AppSecret(c.Context(), c.App.ID, c.Param("secretID"))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, handler.ErrNotFound("unknown_secret", "Secret not found")
		}
		return nil, fmt.Errorf("failed to get secret: %w", err)
	}

	if req.IsSecret != nil {
		if secret.IsSecret && !*req.IsSecret && !req.Value.Valid && secret.ValueEncrypted != "" {
			return nil, handler.ErrBadRequest("value_required", "A new value is required when converting a secret to a non-secret")
		}
		secret.IsSecret = *req.IsSecret
	}

	secret.Name = req.Name
	secret.UpdatedAt = time.Now().UTC()
	if req.Value.Valid {
		secret.ValueEncrypted, err = h.tokenCrypt.EncryptString(req.Value.String)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt secret: %w", err)
		}
	}

	secret, err = h.appSecretStore.UpdateAppSecret(c.Context(), secret)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, handler.ErrNotFound("unknown_secret", "Secret not found")
		}
		if errors.Is(err, store.ErrAlreadyExists) {
			return nil, handler.ErrBadRequest("duplicate_name", "A secret with this name already exists")
		}
		return nil, fmt.Errorf("failed to update secret: %w", err)
	}

	return h.toWire(secret)
}

func (h *AppSecretHandler) HandleAppSecretDelete(c *handler.Context) (*wire.AppSecretDeleteResponse, error) {
	err := h.appSecretStore.DeleteAppSecret(c.Context(), c.App.ID, c.Param("secretID"))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, handler.ErrNotFound("unknown_secret", "Secret not found")
		}
		return nil, fmt.Errorf("failed to delete secret: %w", err)
	}

	return &wire.AppSecretDeleteResponse{}, nil
}
