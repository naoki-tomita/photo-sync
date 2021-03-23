import { createServer, ServerResponse, IncomingMessage } from "http";
import { readFile, mkdir, writeFile } from "fs/promises";
import fetch from "node-fetch";
import open, { apps } from "@kojiro.ueda/open";

const HomeDir = process.env[process.platform == "win32" ? "USERPROFILE" : "HOME"];

async function responseIndex(res: ServerResponse) {
  res.writeHead(200, { "content-type": "text/html" });
  res.write((await readFile("./index.html")).toString("utf-8"));
}

function parseBody(req: IncomingMessage): Promise<string> {
  let result = "";
  return new Promise(ok => (
    req.on("data", data => result = result + data.toString()),
    req.on("end", () => ok(result))
  ));
}

type PromiseResult<T extends Promise<any>> = T extends Promise<infer V> ? V : unknown;

async function waitForCode(): Promise<string> {
  return new Promise(ok => {
    let process: PromiseResult<ReturnType<typeof open>>;
    const server = createServer(async (req, res) => {
      if (req.url?.includes("/code") && req.method?.toUpperCase() === "POST") {
        res.writeHead(200).end();
        const body = await parseBody(req);
        server.close();
        process.kill("SIGKILL");
        ok(body);
      } else {
        return responseIndex(res);
      }
    }).listen(12345, async () => (
      console.log("Open http://localhost:12345"),
      process = await open(
        "",
        {
          app: {
            name: ["google chrome", "google chrome canary"],
            arguments: ["http://localhost:12345", "--incognito"]
          },
          cliArguments: ["-n"]
        }
      )
    ));
  });
}

const client_id = "801165816265-495s8f3dacc900d6q3p092aabbdh0asj.apps.googleusercontent.com";
const client_secret = "Ign6n838YjizfBc66U43K_xw";
const redirect_uri = "http://localhost:12345";

function buildQuery(obj: {[key: string]: string | undefined}) {
  return Object.keys(obj).filter(key => !!obj[key]).map(key => `${key}=${obj[key]}`).join("&")
}

function requestAccessToken(grant_type: "authorization_code" | "refresh_token", value: string) {
  return fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: buildQuery({
      code: grant_type === "authorization_code" ? value: undefined,
      refresh_token: grant_type === "refresh_token" ? value: undefined,
      grant_type,
      client_id,
      client_secret,
      redirect_uri,
    }),
  }).then(async it => it.ok ? it.json() : throwError(await it.text()));
}

function requestAccessTokenByCode(code: string): Promise<AccessToken> {
  return requestAccessToken("authorization_code", code);
}

function requestAccessTokenByRefreshToken(refreshToken: string): Promise<AccessToken> {
  return requestAccessToken("refresh_token", refreshToken);
}

function throwError(e: string): any {
  throw Error(e);
}

interface AccessToken {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  token_type: "Bearer";
};

async function cacheToken(token: AccessToken) {
  await mkdir(`${HomeDir}/.photosync`, { recursive: true });
  await writeFile(`${HomeDir}/.photosync/token.json`, JSON.stringify(token, null, `  `));
  return token;
}

async function readAccessTokenFile(): Promise<AccessToken> {
  return readFile(`${HomeDir}/.photosync/token.json`).then(it => it.toString(`utf-8`)).then(it => JSON.parse(it));
}

async function getAccessToken() {
  try {
    const { refresh_token } = await readAccessTokenFile();
    return requestAccessTokenByRefreshToken(refresh_token);
  } catch (e) {
    const code = await waitForCode();
    return requestAccessTokenByCode(code);
  }
}

async function main() {
  const accessToken = await getAccessToken().then(cacheToken);
  console.log(accessToken);
  // const image = sharp("TEST.JPG");
  // await image
  //   .metadata()
  //   .then(meta => {
  //     const { width, height } = meta;
  //     if (width * height > 16000000) {
  //       const ratio = 16000000 / (width * height);
  //       return image.resize(Math.floor(width * ratio), Math.floor(height * ratio)).withMetadata(meta);
  //     }
  //     return image.withMetadata(meta);
  //   })
  //   .then(i => i.toBuffer())
  //   .then(b => (writeFile("./resized.jpg", b), b))
  //   .then(buf => fetch("https://photoslibrary.googleapis.com/v1/uploads", {
  //     method: "POST",
  //     headers: {
  //       authorization: `Bearer ${accessToken.access_token}`,
  //       "content-type": "application/octet-stream",
  //       "x-goog-upload-content-type": "image/jpeg",
  //       "x-goog-upload-protocol": "raw",
  //     },
  //     body: buf,
  //   }))
  //   .then(response => response.text())
  //   .then(uploadToken => fetch("https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate", {
  //     method: "POST",
  //     headers: {
  //       authorization: `Bearer ${accessToken.access_token}`,
  //       "content-type": "application/json",
  //     },
  //     body: JSON.stringify({
  //       newMediaItems: {
  //         simpleMediaItem: {
  //           fileName: "TEST.JPG",
  //           uploadToken,
  //         }
  //       }
  //     })
  //   }))
  //   .then(response => response.text())
  //   .then(json => console.log(json));
}

main();
