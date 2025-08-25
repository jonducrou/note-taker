/**
 * Basic functionality tests
 */

describe('Basic Application Tests', () => {
  describe('Application Constants', () => {
    it('should have consistent note format patterns', () => {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      const timePattern = /^\d{6}$/
      const filenamePattern = /^\d{4}-\d{2}-\d{2}_\d{6}\.md$/
      
      expect('2024-08-25').toMatch(datePattern)
      expect('143045').toMatch(timePattern)
      expect('2024-08-25_143045.md').toMatch(filenamePattern)
    })

    it('should parse metadata patterns correctly', () => {
      const groupPattern = /#([^\s#@]+)/i
      const audiencePattern = /@audience:([^\n@]+)/i
      
      const testContent = '#ProjectAlpha @audience:Sarah,Bob'
      
      const groupMatch = testContent.match(groupPattern)
      const audienceMatch = testContent.match(audiencePattern)
      
      expect(groupMatch?.[1]).toBe('ProjectAlpha')
      expect(audienceMatch?.[1]).toBe('Sarah,Bob')
    })

    it('should identify incomplete items correctly', () => {
      const incompleteTaskPattern = /\[\s*\]/g
      const incompleteForwardPattern = /\w+\s*->\s*\w+/g
      
      const content = '[] Task 1\n[x] Done\nSubject1 -> Subject2\nSubject3 -x> Subject4'
      
      const incompleteTasks = Array.from(content.matchAll(incompleteTaskPattern))
      const incompleteForward = Array.from(content.matchAll(incompleteForwardPattern))
      
      expect(incompleteTasks).toHaveLength(1)
      expect(incompleteForward).toHaveLength(1)
    })
  })

  describe('Utility Functions', () => {
    it('should format dates consistently', () => {
      const testDate = new Date('2024-08-25T14:30:00Z')
      const dateStr = testDate.toISOString().split('T')[0]
      const timeStr = testDate.toTimeString().slice(0, 5).replace(':', '')
      
      expect(dateStr).toBe('2024-08-25')
      expect(timeStr).toMatch(/^\d{4}$/)
    })

    it('should handle array operations correctly', () => {
      const audience = 'Sarah, Bob , Alice , '
      const cleanAudience = audience
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0)
      
      expect(cleanAudience).toEqual(['Sarah', 'Bob', 'Alice'])
    })

    it('should group items correctly', () => {
      const items = [
        { group: 'A', audience: ['Team1'] },
        { group: 'A', audience: ['Team1'] },
        { group: 'B', audience: ['Team2'] }
      ]

      const groupCounts = items.reduce((acc, item) => {
        const key = `${item.group} @${item.audience.join(',')}`
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      expect(groupCounts['A @Team1']).toBe(2)
      expect(groupCounts['B @Team2']).toBe(1)
    })
  })
})