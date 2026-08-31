// DEVELOPMENT FIXTURE: synthetic selected result; no external model request is made.
type Forecast = { city: string; temperatureC: number; summary: string };

type ToolCall = {
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
  name?: unknown;
  arguments?: unknown;
};

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`Invalid forecast tool field: ${field}`);
  }
  return value;
}

export function parseForecastToolCall(call: ToolCall): Forecast {
  const name = call.function?.name ?? call.name;
  const rawArguments = call.function?.arguments ?? call.arguments;

  if (name !== "record_forecast") {
    throw new TypeError("Unexpected forecast tool name");
  }

  const payload = JSON.parse(requireString(rawArguments, "arguments")) as Record<string, unknown>;
  const city = requireString(payload.city, "city");
  const summary = requireString(payload.summary, "summary");
  const temperatureC = payload.temperature_c;

  if (typeof temperatureC !== "number" || !Number.isFinite(temperatureC)) {
    throw new TypeError("Invalid forecast tool field: temperature_c");
  }

  return { city, temperatureC, summary };
}
