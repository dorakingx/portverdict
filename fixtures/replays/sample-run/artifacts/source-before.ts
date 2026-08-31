// DEVELOPMENT FIXTURE: synthetic source; no external model request is made.
type Forecast = { city: string; temperatureC: number; summary: string };

type ToolCall = {
  name: string;
  arguments: string;
};

export function parseForecastToolCall(call: ToolCall): Forecast {
  const payload = JSON.parse(call.arguments) as Record<string, unknown>;

  return {
    city: String(payload.city),
    temperatureC: Number(payload.temperature_c),
    summary: String(payload.summary),
  };
}
