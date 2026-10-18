import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "next-themes";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout/app-layout";
import { Home } from "@/pages/home";
import { Search } from "@/pages/search";
import { MediaDetail } from "@/pages/media-detail";
import { WatchlistRedirect } from "@/pages/watchlist-redirect";
import { ListsHubPage } from "@/pages/lists-hub";
import { ListsCollectionsPage } from "@/pages/lists-collections";
import { ListDetailPage } from "@/pages/list-detail";
import { ListNewPage } from "@/pages/list-new";
import { Stats } from "@/pages/stats";
import { Browse } from "@/pages/browse";
import { PersonDetail } from "@/pages/person-detail";
import { Updates } from "@/pages/updates";
import { WakoCheckPage } from "@/pages/wako-check";
import { AccessPage } from "@/pages/access";
import { BackupPage } from "@/pages/backup";
import { ReleasePage } from "@/pages/release";
import { WatchSyncPage } from "@/pages/watch-sync";

const ONE_DAY_MS = 24 * 60 * 60_000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: ONE_DAY_MS,
      gcTime: ONE_DAY_MS,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={ListsHubPage} />
        <Route path="/discover" component={Home} />
        <Route path="/search" component={Search} />
        <Route path="/person/:personId" component={PersonDetail} />
        <Route path="/media/:mediaType/:tmdbId" component={MediaDetail} />
        <Route path="/watchlist" component={WatchlistRedirect} />
        <Route path="/lists/new" component={ListNewPage} />
        <Route path="/lists/collections" component={ListsCollectionsPage} />
        <Route path="/lists/:id" component={ListDetailPage} />
        <Route path="/lists" component={ListsHubPage} />
        <Route path="/stats" component={Stats} />
        <Route path="/updates" component={Updates} />
        <Route path="/wako-check" component={WakoCheckPage} />
        <Route path="/access" component={AccessPage} />
        <Route path="/backup" component={BackupPage} />
        <Route path="/release" component={ReleasePage} />
        <Route path="/watch-sync" component={WatchSyncPage} />
        <Route path="/browse" component={Browse} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
