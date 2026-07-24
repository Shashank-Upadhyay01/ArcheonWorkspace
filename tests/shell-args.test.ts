import { describe, it, expect } from 'vitest'
import { joinArgs, parseArgs } from '../src/shared/shell-args'

describe('parseArgs', () => {
  it('returns empty for blank input', () => {
    expect(parseArgs('')).toEqual([])
    expect(parseArgs('   ')).toEqual([])
  })

  it('splits bare tokens on whitespace', () => {
    expect(parseArgs('--full-auto -y')).toEqual(['--full-auto', '-y'])
  })

  it('keeps multi-word double-quoted tokens', () => {
    expect(parseArgs('--path "my project" --flag')).toEqual(['--path', 'my project', '--flag'])
  })

  it('keeps multi-word single-quoted tokens', () => {
    expect(parseArgs("--msg 'hello world'")).toEqual(['--msg', 'hello world'])
  })
})

describe('joinArgs', () => {
  it('joins simple tokens with spaces', () => {
    expect(joinArgs(['--full-auto', '-y'])).toBe('--full-auto -y')
  })

  it('quotes multi-word tokens so they survive parse', () => {
    const args = ['--path', 'my project', '--flag']
    expect(joinArgs(args)).toBe('--path "my project" --flag')
    expect(parseArgs(joinArgs(args))).toEqual(args)
  })

  it('round-trips empty string arg', () => {
    const args = ['--opt', '']
    expect(parseArgs(joinArgs(args))).toEqual(args)
  })

  it('round-trips args with embedded single quotes via double quotes', () => {
    const args = ["it's fine"]
    expect(parseArgs(joinArgs(args))).toEqual(args)
  })
})
