import { ChatStream } from "@/components/app/chat/chat-stream";
import { ComposerView } from "@/components/app/chat/composer-view";
import { NewSessionView } from "@/components/app/chat/new-session-view";
import { StatusBarView } from "@/components/app/chat/status-bar-view";
import { TimelineMinimap } from "@/components/app/chat/timeline-minimap";
import { AppSidebar } from "@/components/app/sidebar/app-sidebar";
import { TopBar } from "@/components/app/topbar/top-bar";
import { Specimen } from "@/app/ui/lib/_showcase/specimen";
import { Frame } from "../_showcase/frame";
import { freshStatusBar, minimapNodes, sessionStats, statusBar, turns } from "../_fixtures/conversation";
import { explorerRows } from "../_fixtures/explorer";
import { projects } from "../_fixtures/sessions";

/** A new session has no selected row: the same projects with nothing active. */
const freshProjects = projects.map((project) => ({ ...project, sessions: project.sessions.map((session) => ({ ...session, active: false })) }));

/** The whole screen, composed from the same views the region sections show one by one. */
export function AppFramesRegion() {
  return (
    <>
      <Specimen name="screen-conversation" title="Session with messages" variants={["sidebar", "top bar", "messages", "timeline", "composer", "status bar"]}>
        <Frame name="app-conversation" size="app">
          <AppSidebar projects={projects} explorerRows={explorerRows} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar stats={sessionStats} />
            <div className="relative flex-1 overflow-hidden">
              <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
                <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
                  {/* Scrolled to the latest turn, as the real chat opens. */}
                  <div data-region="messages" className="min-w-0 flex-1 snap-y snap-mandatory overflow-x-hidden overflow-y-auto pt-4 [scrollbar-width:none]"><ChatStream turns={turns} /></div>
                  <TimelineMinimap nodes={minimapNodes} />
                </div>
                <div className="relative shrink-0">
                  <ComposerView />
                  <StatusBarView {...statusBar} />
                </div>
              </div>
            </div>
          </div>
        </Frame>
      </Specimen>
      <Specimen name="screen-conversation-hover" title="Session with the timeline preview open" variants={["timeline hover preview"]}>
        <Frame name="app-conversation-hover" size="app">
          <AppSidebar projects={projects} explorerRows={explorerRows} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar stats={sessionStats} />
            <div className="relative flex-1 overflow-hidden">
              <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
                <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
                  {/* Scrolled to the latest turn, as the real chat opens. */}
                  <div data-region="messages" className="min-w-0 flex-1 snap-y snap-mandatory overflow-x-hidden overflow-y-auto pt-4 [scrollbar-width:none]"><ChatStream turns={turns} /></div>
                  <TimelineMinimap nodes={minimapNodes} open locatedIndex={1} />
                </div>
                <div className="relative shrink-0">
                  <ComposerView />
                  <StatusBarView {...statusBar} />
                </div>
              </div>
            </div>
          </div>
        </Frame>
      </Specimen>
      <Specimen name="screen-new-session" title="New session" variants={["actions disabled", "fresh status bar"]}>
        <Frame name="app-new" size="app">
          <AppSidebar projects={freshProjects} explorerRows={explorerRows} />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <TopBar fresh />
            <div className="relative flex-1 overflow-hidden">
              <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
                <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden" />
                <div className="relative shrink-0">
                  <NewSessionView />
                  <ComposerView />
                  <StatusBarView {...freshStatusBar} fresh />
                </div>
                <div className="min-h-0 flex-1" />
              </div>
            </div>
          </div>
        </Frame>
      </Specimen>
    </>
  );
}
