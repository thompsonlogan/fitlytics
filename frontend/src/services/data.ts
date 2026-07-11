import { AuthApi } from "./generated/apis/AuthApi"
import { ProgramsApi } from "./generated/apis/ProgramsApi"
import { SessionsApi } from "./generated/apis/SessionsApi"
import { VideosApi } from "./generated/apis/VideosApi"
import { createAuthRefreshMiddleware } from "./auth-refresh-middleware"
import { Configuration, type ConfigurationParameters } from "./generated/runtime"

// ServiceApis is the bundle of OpenAPI-generated clients exposed to the app
// via React context. Add a new line per backend feature slice (one API class
// per @Tags group in the swag annotations).
export interface ServiceApis {
  authApi: AuthApi
  programsApi: ProgramsApi
  sessionsApi: SessionsApi
  videosApi: VideosApi
}

// createServiceApis instantiates each generated API class against a single
// shared Configuration so things like basePath, credentials, and middleware
// stay consistent across endpoints. Called once from main.tsx.
export function createServiceApis(configParams?: ConfigurationParameters): ServiceApis {
  const config = new Configuration({
    ...configParams,
    middleware: [
      createAuthRefreshMiddleware(configParams?.basePath ?? ""),
      ...(configParams?.middleware ?? []),
    ],
  })

  return {
    authApi: new AuthApi(config),
    programsApi: new ProgramsApi(config),
    sessionsApi: new SessionsApi(config),
    videosApi: new VideosApi(config),
  }
}
