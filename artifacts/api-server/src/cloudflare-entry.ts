import { httpServerHandler } from "cloudflare:node";
import app from "./app";

const port = 3000;
app.listen(port);

export default httpServerHandler({ port });
