package wire

import (
	"errors"
	"regexp"
	"time"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"github.com/kitecloud/kite/kite-service/internal/model"
	"gopkg.in/guregu/null.v4"
)

// Names are used in placeholders like {{secrets.NAME}}, so they must be
// identifiers, and are uppercase like environment variables.
var appSecretNameRegex = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

// MaxAppSecretValueLength is the maximum size of a secret's value in bytes.
const MaxAppSecretValueLength = 4096

// AppSecret only includes Value when IsSecret is false; true secrets can't be
// read back once saved.
type AppSecret struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	CommandID       null.String `json:"command_id"`
	EventListenerID null.String `json:"event_listener_id"`
	IsSecret  bool        `json:"is_secret"`
	HasValue  bool        `json:"has_value"`
	Value     null.String `json:"value"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
}

type AppSecretListResponse = []*AppSecret

type AppSecretCreateRequest struct {
	Name       string      `json:"name"`
	Value      string      `json:"value"`
	CommandID       null.String `json:"command_id"`
	EventListenerID null.String `json:"event_listener_id"`
	IsSecret   *bool       `json:"is_secret"`
	AllowEmpty bool        `json:"allow_empty"`
}

func (req AppSecretCreateRequest) Validate() error {
	if req.CommandID.Valid && req.CommandID.String != "" && req.EventListenerID.Valid && req.EventListenerID.String != "" {
		return validation.Errors{
			"event_listener_id": errors.New("cannot specify both command_id and event_listener_id"),
		}
	}
	return validation.ValidateStruct(&req,
		validation.Field(&req.Name, appSecretNameRules()...),
		validation.Field(&req.Value, validation.When(!req.AllowEmpty,
			validation.Required,
			validation.Length(1, MaxAppSecretValueLength),
		), validation.When(req.AllowEmpty,
			validation.Length(0, MaxAppSecretValueLength),
		)),
	)
}

type AppSecretCreateResponse = AppSecret

// AppSecretUpdateRequest renames a secret, updates its secret flag, and
// replaces its value if one is given.
type AppSecretUpdateRequest struct {
	Name     string      `json:"name"`
	Value    null.String `json:"value"`
	IsSecret *bool       `json:"is_secret"`
}

func (req AppSecretUpdateRequest) Validate() error {
	return validation.ValidateStruct(&req,
		validation.Field(&req.Name, appSecretNameRules()...),
		validation.Field(&req.Value, validation.When(req.Value.Valid,
			validation.Required,
			validation.Length(1, MaxAppSecretValueLength),
		)),
	)
}

type AppSecretUpdateResponse = AppSecret

type AppSecretDeleteResponse = Empty

func appSecretNameRules() []validation.Rule {
	return []validation.Rule{
		validation.Required,
		validation.Length(1, 100),
		validation.Match(appSecretNameRegex).
			Error("must only consist of uppercase letters, numbers, and underscores, and not start with a number"),
	}
}

func AppSecretToWire(secret *model.AppSecret, decryptedValue null.String) *AppSecret {
	if secret == nil {
		return nil
	}

	var value null.String
	if !secret.IsSecret && secret.ValueEncrypted != "" && decryptedValue.Valid {
		value = decryptedValue
	}

	return &AppSecret{
		ID:        secret.ID,
		Name:      secret.Name,
		CommandID:       null.NewString(secret.CommandID, secret.CommandID != ""),
		EventListenerID: null.NewString(secret.EventListenerID, secret.EventListenerID != ""),
		IsSecret:  secret.IsSecret,
		HasValue:  secret.ValueEncrypted != "",
		Value:     value,
		CreatedAt: secret.CreatedAt,
		UpdatedAt: secret.UpdatedAt,
	}
}
