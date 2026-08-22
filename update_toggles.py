import codecs

with codecs.open('src/renderer/src/pages/EditorPage.tsx', 'r', 'utf-8') as f:
    content = f.read()

# Add enableBlur state
content = content.replace(
    "const [blurRegions, setBlurRegions] = useState<any[]>([{ id: 'region-1', x: 10, y: 10, w: 20, h: 20, intensity: 10 }]);",
    "const [blurRegions, setBlurRegions] = useState<any[]>([{ id: 'region-1', x: 10, y: 10, w: 20, h: 20, intensity: 10 }]);\n  const [enableBlur, setEnableBlur] = useState(true);"
)

# Update Blur Tab
blur_header_old = """
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">Vùng làm m?</h3>
                    <p className="section-desc">Kéo và thay d?i kích thu?c vùng m? trên b?n xem tru?c.</p>
                  </div>
                  <button 
                    className="btn-outline-dark" 
                    style={{ width: 'auto' }}
                    onClick={() => {
"""
blur_header_new = """
                <div className="section-header-flex">
                  <div>
                    <h3 className="section-title">Vùng làm m?</h3>
                    <p className="section-desc">Áp d?ng làm m? vào video xu?t.</p>
                  </div>
                  <button 
                    className={tn-toggle } 
                    onClick={() => setEnableBlur(!enableBlur)}
                  >
                    {enableBlur ? 'B?t' : 'T?t'}
                  </button>
                </div>
                
                <div style={{ opacity: enableBlur ? 1 : 0.5, pointerEvents: enableBlur ? 'auto' : 'none' }}>
                  <div className="section-header-flex mt-3">
                    <p className="section-desc mb-0">Kéo và thay d?i kích thu?c vùng m? trên b?n xem tru?c.</p>
                    <button 
                      className="btn-outline-dark" 
                      style={{ width: 'auto' }}
                      onClick={() => {
"""
content = content.replace(blur_header_old, blur_header_new)

# Close blur wrapper
blur_close_old = """
                  ))}
                </div>
              </div>
            )}
"""
blur_close_new = """
                  ))}
                </div>
                </div>
              </div>
            )}
"""
content = content.replace(blur_close_old, blur_close_new)

# Update Dubbing Tab
dubbing_old = """
                <div className="tab-pane new-style">
                  
                  <div style={{marginBottom: '15px'}}>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={enableDubbing} onChange={(e) => setEnableDubbing(e.target.checked)} />
                      <span className="checkbox-custom"></span>
                      <span style={{fontWeight: 'bold', color: 'var(--color-primary)'}}>Áp d?ng l?ng ti?ng (AI Dubbing)</span>
                    </label>
                  </div>
  
                <div style={{opacity: enableDubbing ? 1 : 0.5, pointerEvents: enableDubbing ? 'auto' : 'none'}}>
"""
dubbing_new = """
                <div className="tab-pane new-style">
                  
                  <div className="section-header-flex">
                    <div>
                      <h3 className="section-title">L?ng ti?ng (AI)</h3>
                      <p className="section-desc">Áp d?ng l?ng ti?ng vào video xu?t.</p>
                    </div>
                    <button 
                      className={tn-toggle } 
                      onClick={() => setEnableDubbing(!enableDubbing)}
                    >
                      {enableDubbing ? 'B?t' : 'T?t'}
                    </button>
                  </div>
  
                <div style={{opacity: enableDubbing ? 1 : 0.5, pointerEvents: enableDubbing ? 'auto' : 'none', marginTop: '15px'}}>
"""
content = content.replace(dubbing_old, dubbing_new)

# Pass applyBlur to backend
content = content.replace(
    "blurRegions,",
    "blurRegions: enableBlur ? blurRegions : [],"
)

with codecs.open('src/renderer/src/pages/EditorPage.tsx', 'w', 'utf-8') as f:
    f.write(content)
