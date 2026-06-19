import { useState } from 'react'
import App01 from './App_01_Core+Boilerplate'
import App02 from './App_02_Core+Walk'
import App03 from './App_03_Core+DeepWalk'
import App04 from './App_04_Core+Parts'
import App05 from './App_05_React+DefaultComponents'
import App06 from './App_06_React+UseSchemaForm'
import App07 from './App_07_React+Arrays'
import App08 from './App_08_Spike_Overrides'

const examples = [
  { id: '01', name: 'Core + Boilerplate', component: App01 },
  { id: '02', name: 'Core + Walk API', component: App02 },
  { id: '03', name: 'Core + Deep Walk', component: App03 },
  { id: '04', name: 'Core + Parts API', component: App04 },
  { id: '05', name: 'React + Default Components', component: App05 },
  { id: '06', name: 'React + useSchemaForm Hook', component: App06 },
  { id: '07', name: 'React + Array Support', component: App07 },
  { id: '08', name: 'Spike + Overrides (ADR 010)', component: App08 },
]

function App() {
  const [currentExample, setCurrentExample] = useState('08')

  const CurrentComponent =
    examples.find((ex) => ex.id === currentExample)?.component || App01

  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      {/* Top Navigation */}
      <nav
        style={{
          backgroundColor: '#333',
          color: 'white',
          padding: '1rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.25rem', marginRight: '2rem' }}>
          JSON Schema Form Examples
        </h1>
        {examples.map((example) => (
          <button
            key={example.id}
            onClick={() => setCurrentExample(example.id)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor:
                currentExample === example.id ? '#007bff' : 'transparent',
              color: 'white',
              border:
                currentExample === example.id ? 'none' : '1px solid white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            {example.id}. {example.name}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        <CurrentComponent />
      </div>
    </div>
  )
}

export default App
