package provider

import "context"

// SecretProvider gives flows the values of the app's secrets.
type SecretProvider interface {
	// Secrets returns the values of the secrets with the given names. Names
	// the app has no secret for are left out.
	Secrets(ctx context.Context, names []string) (map[string]string, error)
}

// NonSecretProvider is an optional extension of SecretProvider that resolves
// non-secret values (is_secret = false) for use in non-HTTP flow blocks, while
// rejecting true secrets outside of HTTP request blocks.
type NonSecretProvider interface {
	NonSecrets(ctx context.Context, names []string) (map[string]string, error)
}

type MockSecretProvider struct{}

func (p *MockSecretProvider) Secrets(ctx context.Context, names []string) (map[string]string, error) {
	return map[string]string{}, nil
}
