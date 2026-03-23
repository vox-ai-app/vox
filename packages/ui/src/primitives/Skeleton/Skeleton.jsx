const NAV_LABEL_WIDTHS = [36, 54, 66, 52]

function SkeletonLine({ width, style }) {
  return (
    <div
      className="workspace-skeleton-line"
      style={{ width: width ? `${width}%` : undefined, ...style }}
    />
  )
}

function WorkspaceSkeleton() {
  return (
    <section className="workspace-shell workspace-shell-loading">
      <div className="workspace-layout workspace-layout-loading">
        <aside className="workspace-sidebar">
          <div className="workspace-skeleton-wordmark" />

          <nav aria-hidden="true" className="workspace-nav">
            {NAV_LABEL_WIDTHS.map((w, i) => (
              <div className="workspace-skeleton-nav-row" key={i}>
                <div className="workspace-skeleton-icon" />
                <SkeletonLine width={w} />
              </div>
            ))}
          </nav>

          <div className="workspace-sidebar-spacer" />

          <div>
            <hr className="workspace-nav-divider" style={{ marginBottom: 8 }} />
            <div className="workspace-skeleton-user-row">
              <div className="workspace-skeleton-avatar" />
              <SkeletonLine width={52} />
            </div>
          </div>
        </aside>

        <main className="workspace-main workspace-skeleton-main">
          <div className="workspace-skeleton-chat-area" />

          <div className="workspace-skeleton-composer">
            <SkeletonLine style={{ flex: 1, width: undefined }} />
            <div className="workspace-skeleton-composer-btn" />
          </div>
        </main>
      </div>
    </section>
  )
}

export default WorkspaceSkeleton
