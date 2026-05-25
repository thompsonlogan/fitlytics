import {
  AuthApi,
  Configuration,
  ProgramsApi,
  type ConfigurationParameters,
} from "./generated"

// ServiceApis is the bundle of OpenAPI-generated clients exposed to the app
// via React context. Add a new line per backend feature slice (one API class
// per @Tags group in the swag annotations).
export interface ServiceApis {
  authApi: AuthApi
  programsApi: ProgramsApi
}

// createServiceApis instantiates each generated API class against a single
// shared Configuration so things like basePath, credentials, and middleware
// stay consistent across endpoints. Called once from main.tsx.
export function createServiceApis(configParams?: ConfigurationParameters): ServiceApis {
  const config = new Configuration(configParams)

  return {
    authApi: new AuthApi(config),
    programsApi: new ProgramsApi(config),
  }
}
