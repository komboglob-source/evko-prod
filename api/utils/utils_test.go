package utils

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGetFirstPathSegment(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		raw  string
		want string
	}{
		{name: "empty", raw: "", want: ""},
		{name: "root", raw: "/", want: ""},
		{name: "single segment", raw: "/appeals", want: "/appeals"},
		{name: "nested path", raw: "/appeals/123/comments", want: "/appeals"},
		{name: "path with query", raw: "/appeals/123?status_id=1", want: "/appeals"},
		{name: "invalid url", raw: "://bad-url", want: ""},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := GetFirstPathSegment(tc.raw); got != tc.want {
				t.Fatalf("GetFirstPathSegment(%q) = %q, want %q", tc.raw, got, tc.want)
			}
		})
	}
}

func TestIsInteger(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		raw  string
		want int64
	}{
		{name: "plain integer", raw: "123", want: 123},
		{name: "path integer", raw: "/456", want: 456},
		{name: "zero", raw: "0", want: 0},
		{name: "negative", raw: "-1", want: -1},
		{name: "non integer", raw: "abc", want: -1},
		{name: "empty", raw: "", want: -1},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := IsInteger(tc.raw); got != tc.want {
				t.Fatalf("IsInteger(%q) = %d, want %d", tc.raw, got, tc.want)
			}
		})
	}
}

func TestEncodePicToBase64(t *testing.T) {
	t.Parallel()

	if got := EncodePicToBase64(nil); got != "" {
		t.Fatalf("EncodePicToBase64(nil) = %q, want empty string", got)
	}

	if got := EncodePicToBase64([]byte("ok")); got != "b2s=" {
		t.Fatalf("EncodePicToBase64 returned %q, want %q", got, "b2s=")
	}
}

func TestEncodeImage(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		raw  []byte
		want string
	}{
		{name: "empty", raw: nil, want: ""},
		{name: "http url", raw: []byte("https://example.com/a.png"), want: "https://example.com/a.png"},
		{name: "data url", raw: []byte("data:image/png;base64,abc"), want: "data:image/png;base64,abc"},
		{name: "binary", raw: []byte{0x00, 0x01, 0x02}, want: "data:application/octet-stream;base64,AAEC"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if got := EncodeImage(tc.raw); got != tc.want {
				t.Fatalf("EncodeImage(%v) = %q, want %q", tc.raw, got, tc.want)
			}
		})
	}
}

func TestWriteJSON(t *testing.T) {
	t.Parallel()

	recorder := httptest.NewRecorder()
	payload := map[string]any{
		"message": "ok",
		"value":   7,
	}

	WriteJSON(recorder, http.StatusCreated, payload)

	if recorder.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusCreated)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("content-type = %q, want application/json", got)
	}

	var decoded map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &decoded); err != nil {
		t.Fatalf("response body is not valid json: %v", err)
	}

	if decoded["message"] != "ok" {
		t.Fatalf("message = %v, want ok", decoded["message"])
	}
	if decoded["value"] != float64(7) {
		t.Fatalf("value = %v, want 7", decoded["value"])
	}
}

func TestDecodeJSONBody(t *testing.T) {
	t.Parallel()

	type payload struct {
		Name string `json:"name"`
	}

	t.Run("success", func(t *testing.T) {
		t.Parallel()

		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"crm"}`))
		var decoded payload
		if err := DecodeJSONBody(req, &decoded); err != nil {
			t.Fatalf("DecodeJSONBody returned error: %v", err)
		}
		if decoded.Name != "crm" {
			t.Fatalf("decoded name = %q, want crm", decoded.Name)
		}
	})

	t.Run("unknown field rejected", func(t *testing.T) {
		t.Parallel()

		req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"name":"crm","extra":true}`))
		var decoded payload
		err := DecodeJSONBody(req, &decoded)
		if err == nil {
			t.Fatal("DecodeJSONBody should reject unknown fields")
		}
		if !strings.Contains(err.Error(), "unknown field") {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}
