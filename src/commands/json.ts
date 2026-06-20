export type JsonCliOptions = {
  json?: boolean;
};

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
