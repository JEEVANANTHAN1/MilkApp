using OcrOllama.Core;

const string defaultModel = "llava";
const string defaultHost = "http://localhost:11434";
const string defaultPrompt =
    "Extract all text visible in this image exactly as it appears, preserving line breaks. " +
    "Return only the extracted text, with no commentary.";

if (args.Length == 0 || args.Contains("-h") || args.Contains("--help"))
{
    PrintUsage();
    return args.Length == 0 ? 1 : 0;
}

string? imagePath = null;
string model = defaultModel;
string host = defaultHost;
string prompt = defaultPrompt;

for (var i = 0; i < args.Length; i++)
{
    switch (args[i])
    {
        case "--model":
            model = RequireValue(args, ref i, "--model");
            break;
        case "--host":
            host = RequireValue(args, ref i, "--host");
            break;
        case "--prompt":
            prompt = RequireValue(args, ref i, "--prompt");
            break;
        default:
            if (args[i].StartsWith("--"))
            {
                Console.Error.WriteLine($"Unknown option: {args[i]}");
                return 1;
            }
            imagePath ??= args[i];
            break;
    }
}

if (imagePath is null)
{
    Console.Error.WriteLine("Missing required <image-path> argument.");
    PrintUsage();
    return 1;
}

if (!File.Exists(imagePath))
{
    Console.Error.WriteLine($"Image file not found: {imagePath}");
    return 1;
}

byte[] imageBytes;
try
{
    imageBytes = await File.ReadAllBytesAsync(imagePath);
}
catch (IOException ex)
{
    Console.Error.WriteLine($"Could not read image file: {ex.Message}");
    return 1;
}

using var http = new HttpClient { BaseAddress = new Uri(host), Timeout = TimeSpan.FromMinutes(5) };
var client = new OllamaVisionClient(http);

try
{
    var text = await client.ExtractTextAsync(model, prompt, imageBytes, CancellationToken.None);
    Console.WriteLine(text.Trim());
    return 0;
}
catch (HttpRequestException ex)
{
    Console.Error.WriteLine($"Could not reach Ollama at {host}: {ex.Message}");
    Console.Error.WriteLine("Is Ollama running? Try: ollama serve");
    return 1;
}
catch (InvalidOperationException ex)
{
    Console.Error.WriteLine(ex.Message);
    if (ex.Message.Contains("not found", StringComparison.OrdinalIgnoreCase))
    {
        Console.Error.WriteLine($"Try pulling it first: ollama pull {model}");
    }
    return 1;
}

static string RequireValue(string[] args, ref int i, string optionName)
{
    if (i + 1 >= args.Length)
    {
        throw new ArgumentException($"Option {optionName} requires a value.");
    }
    return args[++i];
}

static void PrintUsage()
{
    Console.WriteLine("""
        Usage: OcrOllamaConsole <image-path> [options]

        Extracts text from an image using an Ollama vision model.

        Options:
          --model <name>   Ollama model to use (default: llava)
          --host <url>     Ollama server URL (default: http://localhost:11434)
          --prompt <text>  Custom extraction prompt
          -h, --help       Show this help message

        Example:
          OcrOllamaConsole ./bill.jpg
          OcrOllamaConsole ./bill.jpg --model llama3.2-vision
        """);
}
