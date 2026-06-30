import { Router, type IRouter } from "express";
import { searchPeople, getPersonDetails, getPersonCredits } from "../lib/tmdb";
import { applyExcludeAdult, parseExcludeAdultFromQuery } from "../lib/filter-adult";
import {
  SearchPeopleQueryParams,
  SearchPeopleResponse,
  GetPersonDetailsParams,
  GetPersonDetailsResponse,
  GetPersonCreditsParams,
  GetPersonCreditsQueryParams,
  GetPersonCreditsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/search/people", async (req, res): Promise<void> => {
  const parsed = SearchPeopleQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { query, page = 1 } = parsed.data;
  try {
    const result = await searchPeople(query, page);
    res.json(SearchPeopleResponse.parse(result));
  } catch (err: unknown) {
    req.log.error({ err }, "People search error");
    res.status(500).json({ error: "Failed to search people" });
  }
});

router.get("/people/:personId", async (req, res): Promise<void> => {
  const parsed = GetPersonDetailsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { personId } = parsed.data;
  try {
    const person = await getPersonDetails(personId);
    res.json(GetPersonDetailsResponse.parse(person));
  } catch (err: unknown) {
    req.log.error({ err }, "Person details error");
    res.status(500).json({ error: "Failed to get person details" });
  }
});

router.get("/people/:personId/credits", async (req, res): Promise<void> => {
  const params = GetPersonCreditsParams.safeParse(req.params);
  const query = GetPersonCreditsQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: params.error?.message ?? query.error?.message });
    return;
  }
  const { personId } = params.data;
  const { type = "all", page = 1, page_size = 24 } = query.data;
  const excludeAdult = parseExcludeAdultFromQuery(req.query);
  try {
    let result = await getPersonCredits(personId, type, page, page_size);
    result = applyExcludeAdult(result, excludeAdult);
    res.json(GetPersonCreditsResponse.parse(result));
  } catch (err: unknown) {
    req.log.error({ err }, "Person credits error");
    res.status(500).json({ error: "Failed to get person credits" });
  }
});

export default router;
