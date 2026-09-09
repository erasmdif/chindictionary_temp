---
layout: ../layouts/HomeLayout.astro
title: "CHIND — Dictionarium sinico-latinum"
description: "Digital edition and research environment for Basilio Brollo’s Dictionarium sinico-latinum."
---

<section class="ch-home-hero">
  <div class="ch-home-hero-copy">
    <p class="ch-home-kicker">Brollo's Dictionarium sinico-latinum · digital research edition</p>
    <h1>CHIND <span>Dictionarium sinico-latinum</span></h1>
    <p class="ch-home-lead">A digital environment for browsing, querying, and studying Basilio Brollo’s <em>Dictionarium sinico-latinum</em>, with particular attention to the manuscript Rinuccini 22, its lexical structure, graphic variants, historical romanisations, and internal relationships.</p>
    <div class="ch-home-actions">
      <a class="ch-home-button primary" href="dictionary">Browse the dictionary</a>
      <a class="ch-home-button secondary" href="#project">About the project</a>
    </div>
  </div>
  <div class="ch-home-logo-wrap" aria-hidden="true">
    <img src="images/chind/home/logo_chind.png" alt="" />
  </div>
</section>

<div class="ch-home-paper">
  <section id="project" class="ch-home-section">
    <span class="ch-home-section-number">01 · Manuscript &amp; project</span>
    <div class="ch-home-project-grid">
      <div>
        <h2>The Dictionarium sinico-latinum</h2>
        <div class="ch-home-copy">
          <p>Two principal versions of Basilio Brollo’s (1648–1704; Chinese names Ye Zunxiao 葉尊孝 and Ye Zongxian 葉宗賢) <em>Dictionarium sinico-latinum</em> are known. The first is organised according to Chinese radicals and strokes, while the later version arranges characters alphabetically according to the romanisation of their pronunciation. The original copies are traditionally dated to around 1694 and 1699. For a long time the work circulated only through manuscript copies and became an important instrument for Western missionaries studying Chinese.</p>
          <p>Among the different copies associated with the <em>Dictionarium</em>, CHIN-DICTIONARY focuses on <strong>Rinuccini 22</strong>, preserved at the Biblioteca Medicea Laurenziana in Florence and connected with the earlier, radical-based version of the dictionary.</p>
          <p>This website is one of the outcomes of the PRIN 2022 PNRR project <em>“CHIN-DICTIONARY — Brollo’s Dictionarium sinico-latinum: linguistic innovations, textual connections, and trans-cultural translation”</em> (Project code P2022XBX35; CUP B53D23029330001), funded by the European Union — NextGenerationEU within the National Recovery and Resilience Plan (PNRR), M4C2 — Investment 1.1.</p>
        </div>
      </div>
      <aside class="ch-home-facts" aria-label="Project facts">
        <div class="ch-home-fact"><b>Source</b><span>Rinuccini 22, Biblioteca Medicea Laurenziana, Florence.</span></div>
        <div class="ch-home-fact"><b>Digital model</b><span>A relational representation of characters, readings, occurrences, definitions, variants, and lexical relations.</span></div>
        <div class="ch-home-fact"><b>Research aim</b><span>To make explicit and inferred information searchable without flattening the historical structure of the manuscript.</span></div>
      </aside>
    </div>
  </section>

  <section id="brollo" class="ch-home-section">
    <span class="ch-home-section-number">02 · The author</span>
    <div class="ch-home-profile">
      <figure class="ch-home-figure">
        <img src="images/chind/home/brollo_official.webp" alt="Portrait of Basilio Brollo" />
        <figcaption>Basilio Brollo (1648–1704)</figcaption>
      </figure>
      <div>
        <h2>Basilio Brollo</h2>
        <div class="ch-home-copy">
          <p>Basilio Brollo, also known as Basilio da Gemona, was a Franciscan missionary born in Gemona in 1648. He left for Asia in 1680 and reached Canton in 1684 after a journey of almost four years. During his missionary activity in China he devoted himself intensively to the study of Chinese and to lexicographic work.</p>
          <p>The two versions of the <em>Dictionarium sinico-latinum</em> reflect different strategies for organising and accessing Chinese lexical material: one follows the traditional radical-and-stroke system, while the later version reorganises entries according to pronunciation. Their long manuscript circulation testifies to the practical importance of the work for later missionaries and scholars.</p>
        </div>
        <div class="ch-home-pullquote">The Dictionarium sits at the intersection of European lexicographic practice, Chinese systems of character classification, and the practical requirements of missionary language learning.</div>
      </div>
    </div>
  </section>

  <section id="edition" class="ch-home-section">
    <span class="ch-home-section-number">03 · Digital &amp; critical edition</span>
    <h2>Reading the database together with the critical edition</h2>
    <div class="ch-home-copy ch-home-copy-wide">
      <p>The database is designed to be used in close connection with Gabriele Tola’s critical edition, <em>Basilio Brollo’s Dictionarium sinico-latinum (Chinese-Latin dictionary): A critical edition of the manuscript Rinuccini 22 (Biblioteca Medicea Laurenziana)</em>, published open access by John Benjamins in <em>Studies in the History of the Language Sciences</em>, vol. 134 (2026).</p>
      <p>The critical edition provides the historical, linguistic, and philological analysis of the manuscript. The relational database complements it by formalising and connecting its data: characters, historical romanisations, definitions, graphic variants, lexical relations, page and line references, and appendix material can therefore be queried across the dictionary rather than consulted only sequentially.</p>
      <p>This structure is deliberately extensible. It can accommodate additional graphic forms, readings, meanings, and relations while preserving the link between each interpretation and its documentary evidence.</p>
      <p><a href="https://benjamins.com/catalog/sihols.134" target="_blank" rel="noreferrer">Open the critical edition on John Benjamins ↗</a></p>
    </div>
  </section>

  <section id="explore" class="ch-home-section">
    <span class="ch-home-section-number">04 · Explore CHIND</span>
    <h2>Current sections and research tools</h2>
    <p class="ch-home-section-intro">The website combines a manuscript-oriented dictionary view with indexes and analytical tools built from the same relational data.</p>
    <div class="ch-home-tool-grid">
      <a class="ch-home-tool" href="dictionary">
        <span class="ch-home-tool-no">01</span>
        <strong>Dictionary</strong>
        <p>Browse the manuscript page by page, search characters and historical romanisations across the whole dictionary, and inspect definitions, variants, relations, and appendix sections.</p>
        <i>Open dictionary →</i>
      </a>
      <a class="ch-home-tool" href="characters">
        <span class="ch-home-tool-no">02</span>
        <strong>Index &amp; character records</strong>
        <p>Explore characters by historical or modern radical and stroke count, then open detailed records with readings, definitions, documentary evidence, graphic forms, and relationship maps.</p>
        <i>Open character index →</i>
      </a>
      <a class="ch-home-tool" href="analysis">
        <span class="ch-home-tool-no">03</span>
        <strong>Latin lexical analysis</strong>
        <p>Explore the Latin definitions through corpus cleaning, frequency and dispersion, concordances, recurrent sequences, local lexical contexts, definition length, and descriptive comparisons between portions of the dictionary.</p>
        <i>Open lexical analysis →</i>
      </a>
      <a class="ch-home-tool" href="text-comparison">
        <span class="ch-home-tool-no">04</span>
        <strong>Text comparison</strong>
        <p>Compare an external Chinese text with the dictionary and distinguish directly attested characters, historical graphic forms, documented variants, absent forms, and recognised disyllabic units.</p>
        <i>Open comparison tool →</i>
      </a>
      <a class="ch-home-tool" href="documentation">
        <span class="ch-home-tool-no">05</span>
        <strong>Documentation</strong>
        <p>Read a guided explanation of the interface, data representation, dictionary rows, index visualisations, character records, and the text-comparison workflow.</p>
        <i>Read documentation →</i>
      </a>
      <a class="ch-home-tool" href="credits">
        <span class="ch-home-tool-no">06</span>
        <strong>Credits</strong>
        <p>Project team, participating institutions, research infrastructure, acknowledgements, and attribution of external scholarly resources.</p>
        <i>View credits →</i>
      </a>
    </div>
  </section>

  <section id="examples" class="ch-home-section">
    <span class="ch-home-section-number">05 · Automatic example extraction</span>
    <h2>From romanised examples to structured data</h2>
    <div class="ch-home-project-grid">
      <div class="ch-home-copy">
        <p>The project also investigates the automatic extraction of examples supplied by Brollo only in romanised form and their reconstruction with Chinese characters. In the current experimental workflow, nearly <strong>90%</strong> of the examples were correctly isolated; a further <strong>3%</strong> consisted of trisyllabic examples that were also successfully identified.</p>
        <p>Less than 5% of the actual examples remained unidentified by the code. Analysis of the residual errors showed that homophone and near-homophone cases account for more than half of the unresolved set, illustrating one of the principal methodological difficulties in reconstructing character sequences from historical romanisation alone.</p>
        <div class="ch-home-callout"><strong>Coming soon</strong><span>The structured results of this automatic extraction and reconstruction workflow are being prepared for integration into the website and will be made available through the CHIND interface shortly.</span></div>
      </div>
      <div class="ch-home-stats" aria-label="Automatic extraction summary">
        <div class="ch-home-stat"><b>≈90%</b><span>examples correctly isolated</span></div>
        <div class="ch-home-stat"><b>+3%</b><span>trisyllabic examples successfully isolated</span></div>
        <div class="ch-home-stat"><b>&lt;5%</b><span>actual examples left unidentified</span></div>
        <div class="ch-home-stat"><b>58.6%</b><span>of residual errors linked to homophone or near-homophone cases</span></div>
      </div>
    </div>
  </section>

  <section id="references" class="ch-home-section">
    <span class="ch-home-section-number">06 · References, citation &amp; contact</span>
    <h2>Further reading and use of the database</h2>
    <div class="ch-home-reference-grid">
      <div>
        <h3>Related research</h3>
        <ul class="ch-home-reference-list">
          <li><a href="https://www.benjamins.com/online/hl/articles/hl.00167.cec" target="_blank" rel="noreferrer">Article in <em>Historiographia Linguistica</em> ↗</a></li>
          <li><a href="https://www.benjamins.com/online/hl/articles/hl.00168.mar" target="_blank" rel="noreferrer">Article in <em>Historiographia Linguistica</em> ↗</a></li>
          <li><a href="https://benjamins.com/catalog/sihols.134" target="_blank" rel="noreferrer">Critical edition of Rinuccini 22 ↗</a></li>
        </ul>
      </div>
      <div>
        <h3>Contact</h3>
        <div class="ch-home-copy">
          <p>Scholars, institutions, and individuals interested in cooperation or in expanding the research are invited to contact the principal investigator, Prof. Gabriele Tola. Reports of errors, corrections, and suggestions are equally welcome.</p>
          <p><a href="mailto:gabriele.tola@unipg.it">gabriele.tola@unipg.it</a></p>
        </div>
      </div>
    </div>
    <div class="ch-home-citation">
      <strong>Suggested project citation</strong>
      <p>PRIN 2022 PNRR project “CHIN-DICTIONARY — Brollo’s <em>Dictionarium sinico-latinum</em>: linguistic innovations, textual connections, and trans-cultural translation” (Project code P2022XBX35; CUP B53D23029330001). Principal investigator: Prof. Gabriele Tola; website: <a href="https://chindictionary.lad-sapienza.it" target="_blank" rel="noreferrer">chindictionary.lad-sapienza.it</a>.</p>
      <small>The critical edition published by John Benjamins should be cited independently according to standard bibliographical conventions.</small>
    </div>
  </section>
</div>
