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
import { Watchlist } from "@/pages/watchlist";
import { ListsPage } from "@/pages/lists";
import { ListDetailPage } from "@/pages/list-detail";
import { ListNewPage } from "@/pages/list-new";
import { Stats } from "@/pages/stats";
import { Browse } from "@/pages/browse";
import { PersonDetail } from "@/pages/person-detail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/search" component={Search} />
        <Route path="/person/:personId" component={PersonDetail} />
        <Route path="/media/:mediaType/:tmdbId" component={MediaDetail} />
        <Route path="/watchlist" component={Watchlist} />
        <Route path="/lists/new" component={ListNewPage} />
        <Route path="/lists/:id" component={ListDetailPage} />
        <Route path="/lists" component={ListsPage} />
        <Route path="/stats" component={Stats} />
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
