// short-id.ts
const SHORT_ID_LENGTH = 5;
export default function (): string {
  let text = '';
  // eslint-disable-next-line no-secrets/no-secrets
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let index = 0; index < SHORT_ID_LENGTH; index++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
