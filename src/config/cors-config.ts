import { CorsOptions } from "cors";

const whitelist = [
  "http://localhost:5173",
  "http://localhost:3200",
  "http://localhost:3100",
  "http://10.27.153.193:5173",
  undefined,
];

const CORS_OPTIONS = {
  origin: (origin: string | undefined, callback: any) => {
    if (!origin || whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
} satisfies CorsOptions;

export default CORS_OPTIONS;
