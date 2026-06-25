import { createFakeValidator } from './fakeValidator'
import { contractSchema, runValidatorContract } from './contract'

// The throwaway fake passing the same suite as AJV is the proof that the seam is
// validator-shaped, not AJV-shaped (ADR 008 / ADR 019).
runValidatorContract({
  name: 'fake (throwaway)',
  validate: createFakeValidator(contractSchema),
})
