import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const landingPage = await readFile(new URL('../src/pages/LandingPage.jsx', import.meta.url), 'utf8')
const appRoutes = await readFile(new URL('../src/routes/AppRoutes.jsx', import.meta.url), 'utf8')

test('landing page navigation targets existing sections and public routes', () => {
  for (const section of ['how-it-works', 'students', 'employers']) {
    assert.match(landingPage, new RegExp(`id="${section}"`))
    assert.match(landingPage, new RegExp(`href="#${section}"`))
  }

  for (const route of ['/register', '/login', '/for-employers', '/features', '/about']) {
    assert.ok(landingPage.includes(`to="${route}"`))
    assert.ok(appRoutes.includes(`path="${route}"`))
  }
})

test('landing page keeps the requested sections and removes the repeated long career timeline', () => {
  assert.match(landingPage, /Build the Skills for the Career You Want\./)
  assert.match(landingPage, /Discover Your Strengths/)
  assert.match(landingPage, /Identify Your Skills Gaps/)
  assert.match(landingPage, /Build Towards Opportunity/)
  assert.match(landingPage, /Designed Around Malawi’s Education and Employment Realities/)
  assert.match(landingPage, /Your Career Journey Starts Here\./)
  assert.doesNotMatch(landingPage, /Discover → Assess → Learn → Match → Apply → Get Hired/)
})

test('header registration CTA has one label across screen sizes', () => {
  const headerCta = landingPage.match(/<Link to="\/register" className="inline-flex[\s\S]*?<\/Link>/)?.[0]

  assert.ok(headerCta)
  assert.match(headerCta, />\s*Create Profile\s*<\/Link>/)
  assert.doesNotMatch(headerCta, /Create Your Profile/)
})

test('mobile menu has an accessible toggle and closes after section navigation', () => {
  assert.match(landingPage, /aria-expanded={menuOpen}/)
  assert.match(landingPage, /aria-controls="landing-mobile-menu"/)
  assert.match(landingPage, /id="landing-mobile-menu"/)
  assert.match(landingPage, /href="#students" onClick={closeMenu}/)
  assert.match(landingPage, /href="#employers" onClick={closeMenu}/)
})
