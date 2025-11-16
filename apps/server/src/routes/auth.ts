import { auth } from "@rms-modern/auth";
import { Hono } from "hono";

const authRoute = new Hono();

authRoute.on(["POST", "GET"], "/auth/*", (c) => auth.handler(c.req.raw));

export default authRoute;
