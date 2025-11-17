import { Hono } from "hono";
import { eventsRoute } from "./events.routes";
import { fieldsRoute } from "./fields.routes";
import { matchesRoute } from "./matches.routes";
import { rankingsRoute } from "./rankings.routes";
import { resourcesRoute } from "./resources.routes";
import { stagesRoute } from "./stages.routes";
import { tournamentCoreRoute } from "./tournament-core.routes";

const tournamentsRoute = new Hono();

tournamentsRoute.route("/", tournamentCoreRoute);
tournamentsRoute.route("/", stagesRoute);
tournamentsRoute.route("/", matchesRoute);
tournamentsRoute.route("/", rankingsRoute);
tournamentsRoute.route("/", fieldsRoute);
tournamentsRoute.route("/", resourcesRoute);
tournamentsRoute.route("/", eventsRoute);

export { tournamentsRoute };
