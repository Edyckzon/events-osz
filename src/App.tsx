import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Provider } from "./context";
import { Layout } from "./components";
import { Home, EventPage, Checkout, Tickets, OrderPage, Legal } from "./pages";
import { Account, AuthPage, Callback } from "./auth";
import { Manage, Scanner } from "./manage";
import { TicketLink } from "./ticket-link";
import "./App.css";
function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
export default function App() {
  return (
    <BrowserRouter>
      <Provider>
        <ScrollTop />
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/events/:slug" element={<EventPage />} />
            <Route path="/checkout/:eventId/:typeId" element={<Checkout />} />
            <Route path="/tickets" element={<Tickets />} />
            <Route path="/ticket" element={<TicketLink />} />
            <Route path="/orders/:id" element={<OrderPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/auth/callback" element={<Callback />} />
            <Route path="/account" element={<Account />} />
            <Route path="/manage" element={<Manage />} />
            <Route path="/scan" element={<Scanner />} />
            <Route path="/terms" element={<Legal />} />
            <Route path="/privacy" element={<Legal privacy />} />
            <Route
              path="*"
              element={
                <div className="page">
                  <h1>No encontramos esta página.</h1>
                  <a href="/">Volver al inicio</a>
                </div>
              }
            />
          </Routes>
        </Layout>
      </Provider>
    </BrowserRouter>
  );
}
