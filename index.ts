/**
 * Server start-up – separated from app.ts so tests can import the app
 * without binding a port.
 */

import app from './src/app';

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`dnd-campaign-table server running on port ${PORT}`);
});
