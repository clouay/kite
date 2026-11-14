package flow

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/kitecloud/kite/kite-service/pkg/image"
	"github.com/kitecloud/kite/kite-service/pkg/thing"
)

var (
	reEmptyJSONComma   = regexp.MustCompile(`:\s*,`)
	reEmptyJSONBrace   = regexp.MustCompile(`:\s*}`)
	reEmptyJSONBracket = regexp.MustCompile(`:\s*\]`)
)

func sanitizeJSONVariables(s string) string {
	s = reEmptyJSONComma.ReplaceAllString(s, ": null,")
	s = reEmptyJSONBrace.ReplaceAllString(s, ": null}")
	s = reEmptyJSONBracket.ReplaceAllString(s, ": null]")
	return s
}

func init() {
	registerHandlers(map[FlowNodeType]nodeHandler{
		FlowNodeTypeActionImageGenerate: executeActionImageGenerate,
	})
}

func executeActionImageGenerate(n *CompiledFlowNode, ctx *FlowContext) error {
	if n.Data.ImageTemplateID == "" {
		return &FlowError{Message: "image template ID is required"}
	}

	tmplID, err := ctx.EvalTemplate(n.Data.ImageTemplateID)
	if err != nil {
		return err
	}

	tmpl, err := ctx.ImageTemplate.ImageTemplate(ctx, tmplID.String())
	if err != nil {
		return fmt.Errorf("failed to load image template: %w", err)
	}
	if tmpl == nil {
		return &FlowError{Message: fmt.Sprintf("image template %q not found", tmplID.String())}
	}

	vars := make(map[string]any)

	// Seed with default sample data from template as baseline fallbacks
	if tmpl.SampleData != nil {
		for k, v := range tmpl.SampleData {
			vars[k] = v
		}
	}

	// Add ambient flow environment context (user, guild, channel, etc.)
	if ctx.EvalCtx.Env != nil {
		for k, v := range ctx.EvalCtx.Env {
			if _, exists := vars[k]; !exists {
				vars[k] = v
			}
		}
	}

	setVar := func(k string, val any) {
		if val == nil || fmt.Sprint(val) == "" {
			return
		}
		cleanK := strings.Trim(k, "{} ")
		vars[k] = val
		vars[cleanK] = val

		// If val is a map (e.g. user or member object), unpack sub-properties
		if m, ok := val.(map[string]any); ok {
			for subK, subV := range m {
				vars[cleanK+"."+subK] = subV
				vars[cleanK+"_"+subK] = subV
				if cleanK == "user" || cleanK == "member" || cleanK == "target_user" || cleanK == "target_member" {
					vars[subK] = subV
				}
			}
		}

		// Alias mappings
		if cleanK == "username" {
			vars["user.username"] = val
			vars["user_username"] = val
		} else if cleanK == "user.username" || cleanK == "user_username" {
			vars["username"] = val
		}

		if cleanK == "avatar" || cleanK == "avatar_url" {
			vars["avatar"] = val
			vars["avatar_url"] = val
			vars["image_avatar"] = val
			vars["user.avatar"] = val
			vars["user.avatar_url"] = val
			vars["user_avatar_url"] = val
		} else if cleanK == "user.avatar" || cleanK == "user.avatar_url" || cleanK == "user_avatar_url" {
			vars["avatar"] = val
			vars["avatar_url"] = val
			vars["image_avatar"] = val
		}

		if strings.HasSuffix(cleanK, "_url") {
			root := strings.TrimSuffix(cleanK, "_url")
			vars[root] = val
		}
		if strings.HasSuffix(cleanK, "_value") {
			root := strings.TrimSuffix(cleanK, "_value")
			vars[root] = val
		}
		if strings.HasSuffix(cleanK, "_label") {
			root := strings.TrimSuffix(cleanK, "_label")
			vars[root] = val
		}
	}

	if n.Data.ImageVariables != "" {
		var rawMap map[string]any
		if err := json.Unmarshal([]byte(n.Data.ImageVariables), &rawMap); err == nil {
			for k, v := range rawMap {
				strVal := fmt.Sprint(v)
				if strings.Contains(strVal, "{{") || strings.Contains(strVal, "{") {
					evaluated, err := ctx.EvalTemplate(strVal)
					if err == nil {
						setVar(k, evaluated.String())
					} else {
						setVar(k, v)
					}
				} else if v != nil && strVal != "" {
					setVar(k, v)
				}
			}
		} else {
			evaluated, err := ctx.EvalTemplateRaw(n.Data.ImageVariables)
			if err == nil {
				val := evaluated.JSONValue()
				if m, ok := val.(map[string]any); ok {
					for k, v := range m {
						setVar(k, v)
					}
				} else {
					rawStr := evaluated.String()
					if rawStr != "" {
						sanitized := sanitizeJSONVariables(rawStr)
						var fallbackMap map[string]any
						if err := json.Unmarshal([]byte(sanitized), &fallbackMap); err == nil {
							for k, v := range fallbackMap {
								setVar(k, v)
							}
						}
					}
				}
			}
		}
	}

	// Deep copy layers so in-memory cached template data is never mutated
	renderLayers := make([]image.Layer, len(tmpl.Data.Layers))
	copy(renderLayers, tmpl.Data.Layers)
	renderData := tmpl.Data
	renderData.Layers = renderLayers

	imgBytes, ext, err := image.RenderImage(tmpl.Width, tmpl.Height, tmpl.Format, &renderData, vars)
	if err != nil {
		return fmt.Errorf("failed to render image: %w", err)
	}

	filename := fmt.Sprintf("image_%s.%s", n.ID, ext)
	attachmentURI := fmt.Sprintf("attachment://%s", filename)
	ctx.StoreAttachment(filename, imgBytes)

	resultMap := map[string]thing.Thing{
		"url":        thing.NewString(attachmentURI),
		"attachment": thing.NewString(attachmentURI),
		"filename":   thing.NewString(filename),
		"width":      thing.NewInt(tmpl.Width),
		"height":     thing.NewInt(tmpl.Height),
	}

	ctx.StoreNodeResult(n, thing.NewObject(resultMap))
	return n.ExecuteChildren(ctx)
}
