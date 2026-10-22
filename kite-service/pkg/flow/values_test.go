package flow

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/kitecloud/kite/kite-service/pkg/eval"
	"github.com/kitecloud/kite/kite-service/pkg/provider"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// valueTestProvider has true secrets, which only {{secrets.NAME}} can use,
// and non-secret values, which {{values.NAME}} can use in any block.
type valueTestProvider struct {
	secretTestProvider
	nonSecrets map[string]string
}

func (p *valueTestProvider) NonSecrets(ctx context.Context, names []string) (map[string]string, error) {
	res := map[string]string{}
	for _, name := range names {
		if _, isSecret := p.values[name]; isSecret {
			return nil, fmt.Errorf("%s is a secret", name)
		}
		if v, ok := p.nonSecrets[name]; ok {
			res[name] = v
		}
	}
	return res, nil
}

func valuesTestContext(t *testing.T, p *valueTestProvider, httpProvider *httpTestProvider, logs provider.LogProvider) *FlowContext {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	t.Cleanup(cancel)

	c := NewContext(
		ctx,
		5*time.Second,
		&TestContextData{},
		FlowProviders{
			Discord: &provider.MockDiscordProvider{},
			HTTP:    httpProvider,
			Log:     logs,
			Secret:  p,
		}, FlowContextLimits{
			MaxStackDepth: 10,
			MaxOperations: 1000,
			MaxCredits:    1000,
		},
		eval.NewContext(eval.Env{}),
		nil,
	)
	t.Cleanup(c.Cancel)
	return c
}

func newValueTestProvider() *valueTestProvider {
	return &valueTestProvider{
		secretTestProvider: secretTestProvider{values: map[string]string{"API_KEY": "s3cr3t"}},
		nonSecrets:         map[string]string{"GREETING": "hello world"},
	}
}

func TestValuesWorkInAnyBlock(t *testing.T) {
	p := newValueTestProvider()
	logs := &recordingLogProvider{}
	c := valuesTestContext(t, p, &httpTestProvider{}, logs)

	node := &CompiledFlowNode{ID: "1", Type: FlowNodeTypeActionLog, Data: FlowNodeData{LogMessage: "msg: {{values.GREETING}}"}}
	require.NoError(t, node.Execute(c))
	assert.Equal(t, []string{"msg: hello world"}, logs.messages)
}

func TestValuesCantReadSecrets(t *testing.T) {
	p := newValueTestProvider()
	c := valuesTestContext(t, p, &httpTestProvider{}, &provider.MockLogProvider{})

	node := &CompiledFlowNode{ID: "1", Type: FlowNodeTypeActionLog, Data: FlowNodeData{LogMessage: "{{values.API_KEY}}"}}
	assert.ErrorContains(t, node.Execute(c), "API_KEY is a secret")
}

// Values and secrets can be used together in a request.
func TestValuesAndSecretsInRequests(t *testing.T) {
	p := newValueTestProvider()
	httpProvider := &httpTestProvider{}
	c := valuesTestContext(t, p, httpProvider, &provider.MockLogProvider{})

	node := httpNode(HTTPRequestData{
		URL:     "https://example.com/?q={{values.GREETING}}",
		Method:  "GET",
		Headers: []HTTPRequestDataKeyValue{{Key: "Authorization", Value: "Bearer {{secrets.API_KEY}}"}},
	})
	require.NoError(t, node.Execute(c))
	assert.Equal(t, "hello world", httpProvider.req.URL.Query().Get("q"))
	assert.Equal(t, "Bearer s3cr3t", httpProvider.req.Header.Get("Authorization"))
}
