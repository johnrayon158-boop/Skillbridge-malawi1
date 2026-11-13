import AppRoutes from './routes/AppRoutes'
import { ColorModeProvider } from './contexts/ColorModeProvider'

function App() {
  return <ColorModeProvider><AppRoutes /></ColorModeProvider>
}

export default App
