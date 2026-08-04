using OcrOllama.Core;

const string defaultPrompt =
    "Extract all text visible in this image exactly as it appears, preserving line breaks. " +
    "Return only the extracted text, with no commentary.";

var builder = WebApplication.CreateBuilder(args);

var ollamaHost = builder.Configuration["Ollama:Host"] ?? "http://localhost:11434";
var defaultModel = builder.Configuration["Ollama:Model"] ?? "llava";
var allowedOrigin = builder.Configuration["Ollama:AllowedOrigin"] ?? "http://localhost:4200";

const string corsPolicy = "AngularDev";
builder.Services.AddCors(options =>
{
    options.AddPolicy(corsPolicy, policy =>
        policy.WithOrigins(allowedOrigin).AllowAnyHeader().AllowAnyMethod());
});

builder.Services.AddHttpClient<OllamaVisionClient>(client =>
{
    client.BaseAddress = new Uri(ollamaHost);
    client.Timeout = TimeSpan.FromMinutes(5);
});

var app = builder.Build();

app.UseCors(corsPolicy);

app.MapGet("/", () => Results.Ok(new { status = "ok", ollamaHost, defaultModel }));

app.MapPost("/api/ocr", async (HttpRequest request, OllamaVisionClient client, CancellationToken ct) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new { error = "Expected multipart/form-data with an 'image' file." });
    }

    var form = await request.ReadFormAsync(ct);
    var file = form.Files["image"];
    if (file is null || file.Length == 0)
    {
        return Results.BadRequest(new { error = "Missing 'image' file in the form data." });
    }

    var model = form["model"].FirstOrDefault() is { Length: > 0 } m ? m : defaultModel;
    var prompt = form["prompt"].FirstOrDefault() is { Length: > 0 } p ? p : defaultPrompt;

    using var ms = new MemoryStream();
    await file.CopyToAsync(ms, ct);

    try
    {
        var text = await client.ExtractTextAsync(model, prompt, ms.ToArray(), ct);
        return Results.Ok(new { text = text.Trim() });
    }
    catch (HttpRequestException ex)
    {
        return Results.Problem(
            detail: $"Could not reach Ollama at {ollamaHost}: {ex.Message}",
            statusCode: StatusCodes.Status502BadGateway);
    }
    catch (InvalidOperationException ex)
    {
        return Results.Problem(detail: ex.Message, statusCode: StatusCodes.Status502BadGateway);
    }
});

app.Run();
