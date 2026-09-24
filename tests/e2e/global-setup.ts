import path from "node:path";
import { generateAll } from "../../scripts/fake-camera";

export default function globalSetup(): void {
  const dir = path.resolve(__dirname, "../fixtures/camera");
  const written = generateAll(dir);
  if (written.length) console.log(`Generated fake camera videos: ${written.map((f) => path.basename(f)).join(", ")}`);
}
