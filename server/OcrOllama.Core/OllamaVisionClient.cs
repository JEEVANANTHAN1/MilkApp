using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OcrOllama.Core;

/// <summary>
/// Minimal client for Ollama's /api/generate endpoint, used here to send a
/// single image + prompt to a multimodal model and get back its text response.
/// The caller owns the HttpClient (its BaseAddress must be the Ollama host)
/// and is responsible for disposing it.
/// </summary>
public sealed class OllamaVisionClient(HttpClient http)
{
    private readonly HttpClient _http = http;

    public async Task<string> ExtractTextAsync(string model, string prompt, byte[] imageBytes, CancellationToken ct)
    {
        var request = new GenerateRequest
        {
            Model = model,
            Prompt = prompt,
            Images = [Convert.ToBase64String(imageBytes)],
            Stream = false,
        };

        using var response = await _http.PostAsJsonAsync("/api/generate", request, JsonContext.Default.GenerateRequest, ct);

        if (!response.IsSuccessStatusCode)
        {
            var body = await response.Content.ReadAsStringAsync(ct);
            throw new InvalidOperationException(
                $"Ollama returned {(int)response.StatusCode} {response.ReasonPhrase}: {body}");
        }

        var result = await response.Content.ReadFromJsonAsync(JsonContext.Default.GenerateResponse, ct)
            ?? throw new InvalidOperationException("Ollama returned an empty response.");

        return result.Response;
    }
}

public sealed class GenerateRequest
{
    [JsonPropertyName("model")]
    public required string Model { get; init; }

    [JsonPropertyName("prompt")]
    public required string Prompt { get; init; }

    [JsonPropertyName("images")]
    public required List<string> Images { get; init; }

    [JsonPropertyName("stream")]
    public bool Stream { get; init; }
}

public sealed class GenerateResponse
{
    [JsonPropertyName("response")]
    public string Response { get; init; } = string.Empty;

    [JsonPropertyName("done")]
    public bool Done { get; init; }
}

[JsonSerializable(typeof(GenerateRequest))]
[JsonSerializable(typeof(GenerateResponse))]
internal partial class JsonContext : JsonSerializerContext
{
}
