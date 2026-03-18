import { router } from './trpc'
import { imageRouter } from './routers/image'
import { settingsRouter } from './routers/settings'

export const appRouter = router({
  image: imageRouter,
  settings: settingsRouter,
})

export type AppRouter = typeof appRouter
