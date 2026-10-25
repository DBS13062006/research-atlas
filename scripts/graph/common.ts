// Shared connections for the graph scripts (run with --conditions=react-server so the server modules load).
import postgres from "postgres";
import { ownerUrl } from "../db/urls";

export function ownerSql() {
  return postgres(`${ownerUrl()}?sslmode=disable`, { max: 2, onnotice: () => {} });
}
