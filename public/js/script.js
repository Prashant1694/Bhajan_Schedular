// Global Dark Mode Controller
(function initGlobalTheme() {
  function syncAllThemeToggles() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var btns = document.querySelectorAll('.theme-toggle');
    btns.forEach(function(btn) {
      btn.setAttribute('data-tooltip', isDark ? 'Switch to Light' : 'Switch to Dark');
      btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    });
  }

  function handleToggleClick(e) {
    if (e && e.preventDefault) e.preventDefault();
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('bp-theme', 'light'); } catch(err){}
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      try { localStorage.setItem('bp-theme', 'dark'); } catch(err){}
    }
    syncAllThemeToggles();
  }

  window.toggleTheme = handleToggleClick;

  function bindThemeButtons() {
    syncAllThemeToggles();
    var btns = document.querySelectorAll('.theme-toggle');
    btns.forEach(function(btn) {
      if (!btn._themeAttached) {
        btn._themeAttached = true;
        btn.addEventListener('click', handleToggleClick);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindThemeButtons);
  } else {
    bindThemeButtons();
  }
})();

function switchTab(tabName, element) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById(tabName).classList.add('active');
  
  // Highlight clicked tab
  if (element) {
    element.classList.add('active');
  } else if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }
}

function showDetails(deity, singer, bhajan, scale, speed) {
  document.getElementById('modalDeityName').textContent = deity + ' Bhajan';
  document.getElementById('modalSinger').textContent = singer;
  document.getElementById('modalBhajan').textContent = bhajan;
  document.getElementById('modalScale').textContent = scale || 'Not specified';
  const formattedSpeed = speed ? speed.charAt(0).toUpperCase() + speed.slice(1) : '';
  document.getElementById('modalSpeed').textContent = formattedSpeed;
  document.getElementById('detailsModal').classList.add('show');
}

function closeModal() {
  document.getElementById('detailsModal').classList.remove('show');
}

function closeConfirmModal() {
  const modal = document.getElementById('confirmSubmitModal');
  if(modal) modal.classList.remove('show');
}

function closeSelectBhajanModal() {
  const modal = document.getElementById('selectBhajanModal');
  if(modal) modal.classList.remove('show');
  const titleInput = document.getElementById('bhajanTitleInput');
  if (titleInput) {
    titleInput.focus();
  }
}

function openSelectBhajanModal() {
  const modal = document.getElementById('selectBhajanModal');
  if(modal) modal.classList.add('show');
}

document.addEventListener('DOMContentLoaded', function() {
  const sidebarToggle = document.getElementById('sidebarToggle');
  const mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  // Desktop: collapse/expand sidebar (icon-only mode)
  if (localStorage.getItem('admin_sidebar_collapsed') === 'true') document.body.classList.add('sidebar-collapsed');
  sidebarToggle?.addEventListener('click', () => {
    // On mobile, treat the in-sidebar toggle as a close button
    if (window.innerWidth <= 768) {
      document.body.classList.remove('mobile-sidebar-open');
      return;
    }
    document.body.classList.toggle('sidebar-collapsed');
    localStorage.setItem('admin_sidebar_collapsed', String(document.body.classList.contains('sidebar-collapsed')));
  });

  // Mobile: hamburger opens overlay sidebar
  const openMobileSidebar = () => {
    document.body.classList.add('mobile-sidebar-open');
  };
  const closeMobileSidebar = () => {
    document.body.classList.remove('mobile-sidebar-open');
  };

  mobileSidebarToggle?.addEventListener('click', openMobileSidebar);

  // Clicking the dim overlay closes the sidebar
  sidebarOverlay?.addEventListener('click', closeMobileSidebar);

  // Close sidebar when a nav link is tapped on mobile
  if (window.innerWidth <= 768) {
    document.querySelectorAll('.sidebar-nav a, .sidebar-footer a').forEach(link => {
      link.addEventListener('click', closeMobileSidebar);
    });
  }

  // Close mobile sidebar on resize to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      closeMobileSidebar();
    }
  });

  const adminInput = document.querySelector('input[name="admin"]');
  const isAdmin = adminInput && adminInput.value === 'true';

  if (new URLSearchParams(window.location.search).get('copy') === 'true' && typeof openCopySessionModal === 'function') {
    setTimeout(openCopySessionModal, 0);
  }

  // Fetch Singer Dictionary for Autocomplete
  const singerList = document.getElementById('singerList');
  const singerInput = document.getElementById('singerName');
  const singerSuggestions = document.getElementById('singerSuggestions');
  const genderSelect = document.getElementById('gender');
  const lockedGenderInput = document.getElementById('lockedGender');
  let singerNames = [];
  let singersByName = new Map();
  let activeSingerIndex = -1;

  const hideSingerSuggestions = () => {
    singerSuggestions?.classList.remove('show');
    singerInput?.setAttribute('aria-expanded', 'false');
  };

  const applySingerGender = (name) => {
    const singer = singersByName.get(name.trim().toLocaleLowerCase());
    if (singer?.gender && genderSelect) {
      const genderChanged = genderSelect.value !== singer.gender;
      genderSelect.value = singer.gender;
      genderSelect.disabled = true;
      genderSelect.setAttribute('aria-disabled', 'true');
      if (lockedGenderInput) lockedGenderInput.value = singer.gender;
      if (genderChanged) genderSelect.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (genderSelect) {
      genderSelect.disabled = false;
      genderSelect.removeAttribute('aria-disabled');
      if (lockedGenderInput) lockedGenderInput.value = '';
    }
  };

  const renderSingerSuggestions = () => {
    if (!singerInput || !singerSuggestions) return;
    const search = singerInput.value.trim().toLocaleLowerCase();
    const matches = singerNames
      .filter(name => name.toLocaleLowerCase().includes(search))
      .slice(0, 12);
    singerSuggestions.innerHTML = '';
    activeSingerIndex = -1;
    matches.forEach((name, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'bhajan-suggestion';
      option.setAttribute('role', 'option');
      option.id = `singer-suggestion-${index}`;
      option.textContent = name;
      option.addEventListener('mousedown', event => {
        event.preventDefault();
        singerInput.value = name;
        applySingerGender(name);
        hideSingerSuggestions();
      });
      singerSuggestions.appendChild(option);
    });
    const hasMatches = matches.length > 0;
    singerSuggestions.classList.toggle('show', hasMatches);
    singerInput.setAttribute('aria-expanded', String(hasMatches));
  };

  if (singerList) {
    fetch('/api/singers')
      .then(res => res.json())
      .then(data => {
        singerNames = data.map(singer => singer.name);
        singersByName = new Map(data.map(singer => [singer.name.toLocaleLowerCase(), singer]));
        data.forEach(singer => {
          const option = document.createElement('option');
          option.value = singer.name;
          singerList.appendChild(option);
        });
        if (singerInput?.value) applySingerGender(singerInput.value);
      }).catch(err => console.error('Failed to load singer dictionary'));
  }

  singerInput?.addEventListener('input', () => {
    applySingerGender(singerInput.value);
    renderSingerSuggestions();
    fetchScaleSuggestions();
  });
  singerInput?.addEventListener('blur', () => setTimeout(hideSingerSuggestions, 150));
  singerInput?.addEventListener('keydown', event => {
    const options = Array.from(singerSuggestions?.querySelectorAll('.bhajan-suggestion') || []);
    if (!options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeSingerIndex = event.key === 'ArrowDown'
        ? (activeSingerIndex + 1) % options.length
        : (activeSingerIndex - 1 + options.length) % options.length;
      options.forEach((option, index) => option.classList.toggle('active', index === activeSingerIndex));
      singerInput.setAttribute('aria-activedescendant', options[activeSingerIndex].id);
    } else if (event.key === 'Enter' && activeSingerIndex >= 0) {
      event.preventDefault();
      options[activeSingerIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    } else if (event.key === 'Escape') {
      hideSingerSuggestions();
    }
  });

  // 1. Load saved details only if not in admin mode
  if (!isAdmin) {
    const savedName = localStorage.getItem('bj_singer_name');
    const savedGender = localStorage.getItem('bj_gender');

    if (savedName) {
      const nameInput = document.querySelector('input[name="singer_name"]');
      if (nameInput) nameInput.value = savedName;
    }
    if (savedGender) {
      const genderSelect = document.querySelector('select[name="gender"]');
      if (genderSelect) genderSelect.value = savedGender;
    }
  }

  // Modal close on outside click
  window.onclick = function(event) {
    const modal = document.getElementById('detailsModal');
    const confirmModal = document.getElementById('confirmSubmitModal');
    const selectModal = document.getElementById('selectBhajanModal');
    if (event.target == modal) closeModal();
    if (confirmModal && event.target == confirmModal) closeConfirmModal();
    if (selectModal && event.target == selectModal) closeSelectBhajanModal();
  }

  let selectedDeity = null;
  let currentMasterBhajans = []; // Array to hold the API data
  const titleInput = document.getElementById('bhajanTitleInput');
  const suggestions = document.getElementById('bhajanSuggestions');
  let activeSuggestionIndex = -1;

  const renderBhajanSuggestions = () => {
    if (!suggestions || !titleInput || !selectedDeity) return;
    const search = titleInput.value.trim().toLocaleLowerCase();
    const matches = currentMasterBhajans
      .filter(bhajan => bhajan.title.toLocaleLowerCase().includes(search))
      .slice(0, 12);

    suggestions.innerHTML = '';
    activeSuggestionIndex = -1;
    matches.forEach((bhajan, index) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'bhajan-suggestion';
      option.setAttribute('role', 'option');
      option.id = `bhajan-suggestion-${index}`;
      option.textContent = bhajan.title;
      option.addEventListener('mousedown', event => {
        event.preventDefault(); // Keep focus in the input while selecting.
        titleInput.value = bhajan.title;
        const masterIdInput = document.getElementById('selectedMasterBhajanId');
        if (masterIdInput) masterIdInput.value = bhajan.id;
        hideBhajanSuggestions();
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      suggestions.appendChild(option);
    });

    const hasMatches = matches.length > 0;
    suggestions.classList.toggle('show', hasMatches);
    titleInput.setAttribute('aria-expanded', String(hasMatches));
  };

  const hideBhajanSuggestions = () => {
    suggestions?.classList.remove('show');
    titleInput?.setAttribute('aria-expanded', 'false');
  };

  // Convert the stored Indian shruti notation by five semitones. This is used
  // only when a dedicated female shruti has not been entered in the master DB.
  const femaleFallbackShruti = (maleShruti) => {
    const match = String(maleShruti || '').trim().match(/^(1|1\.5|2|2\.5|3|4|4\.5|5|5\.5|6|6\.5|7)\s*([pPmM])$/);
    if (!match) return '';
    const values = ['1', '1.5', '2', '2.5', '3', '4', '4.5', '5', '5.5', '6', '6.5', '7'];
    let pitch = values.indexOf(match[1]);
    if (match[2].toUpperCase() === 'M') pitch = (pitch + 5) % 12;
    const femalePitch = (pitch - 5 + 12) % 12;
    return `${values[femalePitch]}P`;
  };

  const scaleForGender = (bhajan, gender) => {
    const femaleShruti = String(bhajan.shruti_female || '').trim();
    const rawMaleShruti = String(bhajan.shruti || '').trim();
    const maleShruti = rawMaleShruti === '#N/A' ? '' : rawMaleShruti;
    if (gender === 'Female') {
      if (femaleShruti && femaleShruti !== '#N/A') {
        return { scale: femaleShruti, usedFallback: false };
      }
      return { scale: femaleFallbackShruti(maleShruti) || maleShruti, usedFallback: true };
    }
    return { scale: maleShruti, usedFallback: false };
  };

  // Deity card selection
  document.querySelectorAll('.deity-card.available').forEach(card => {
    card.addEventListener('click', function() {
      document.querySelectorAll('.deity-card').forEach(c => c.classList.remove('selected'));
      this.classList.add('selected');
      selectedDeity = this.dataset.deity;
      
      document.getElementById('selectedDeity').value = selectedDeity;
      document.getElementById('deityDisplay').textContent = selectedDeity;
      document.getElementById('bhajanDetails').classList.add('show');
      
      
      // Reset fields
      titleInput.value = '';
      const masterIdInput = document.getElementById('selectedMasterBhajanId');
      if (masterIdInput) masterIdInput.value = '';
      titleInput.placeholder = `Loading ${selectedDeity} bhajans...`;
      document.getElementById('masterDataBadge').style.display = 'none';

      // Fetch Master Bhajans
      fetch(`/api/master-bhajans/${selectedDeity}`)
        .then(response => response.json())
        .then(data => {
          currentMasterBhajans = data; // Save data globally for this session
          titleInput.placeholder = `Search ${data.length} ${selectedDeity} bhajans...`;
          renderBhajanSuggestions();
        })
        .catch(err => titleInput.placeholder = "Type bhajan name here...");
        
      setTimeout(() => {
        document.getElementById('bhajanDetails').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    });
  });

  // MAGIC AUTO-FILL LOGIC: Listen for when they select a title
  let searchTimeout;
  titleInput.addEventListener('input', function(e) {
    if (e.isTrusted) {
      // User typed or edited manually: require explicit dropdown selection
      const masterIdInput = document.getElementById('selectedMasterBhajanId');
      if (masterIdInput) masterIdInput.value = '';
    }
    const enteredTitle = e.target.value.trim().toLocaleLowerCase();
    const isExactBhajan = currentMasterBhajans.some(
      bhajan => bhajan.title.trim().toLocaleLowerCase() === enteredTitle
    );
    if (isExactBhajan) hideBhajanSuggestions();
    else renderBhajanSuggestions();
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const selectedTitle = e.target.value;
    
    // Find the bhajan in our downloaded master list
    const matchedBhajan = currentMasterBhajans.find(b => b.title === selectedTitle);
    
    // Helper to catch empty strings or #N/A from the excel file
    const cleanValue = (val) => (val && val !== '#N/A' && String(val).trim() !== '') ? val : 'Not specified';

    const warningDiv = document.getElementById('cooldownWarning');
    const fetchScaleSuggestions = () => {
      const title = titleInput ? titleInput.value.trim() : '';
      const singer = singerInput ? singerInput.value.trim() : '';
      const gender = genderSelect ? genderSelect.value.trim() : '';

      const prevBadge = document.getElementById('singerPrevScaleBadge');
      const prevVal = document.getElementById('singerPrevScaleVal');
      const genderBadge = document.getElementById('genderCommonScaleBadge');
      const genderLabel = document.getElementById('genderCommonScaleLabel');
      const genderVal = document.getElementById('genderCommonScaleVal');

      if (!title) {
        if (prevBadge) prevBadge.style.display = 'none';
        if (genderBadge) genderBadge.style.display = 'none';
        return;
      }

      const params = new URLSearchParams({
        title: title,
        singer_name: singer,
        gender: gender
      });

      fetch('/api/scale-suggestions?' + params.toString())
        .then(res => res.json())
        .then(data => {
          if (data && data.singerPreviousScale && prevBadge && prevVal) {
            prevVal.textContent = data.singerPreviousScale;
            prevBadge.style.display = 'block';
          } else if (prevBadge) {
            prevBadge.style.display = 'none';
          }

          if (data && data.mostCommonGenderScale && genderBadge && genderLabel && genderVal) {
            genderLabel.textContent = data.mostCommonGenderScale.gender;
            genderVal.textContent = data.mostCommonGenderScale.scale;
            genderBadge.style.display = 'block';
          } else if (genderBadge) {
            genderBadge.style.display = 'none';
          }
        })
        .catch(err => {
          if (prevBadge) prevBadge.style.display = 'none';
          if (genderBadge) genderBadge.style.display = 'none';
        });
    };

    if (selectedTitle.trim().length > 0) {
      fetch('/api/check-cooldown?title=' + encodeURIComponent(selectedTitle))
        .then(res => res.json())
        .then(data => {
          if (data && warningDiv) {
            warningDiv.innerHTML = `⚠️ <strong>Cool-down warning:</strong> This bhajan was last sung by <strong>${data.singer_name}</strong> on <strong>${data.session_date}</strong>.`;
            warningDiv.style.display = 'block';
          } else if (warningDiv) {
            warningDiv.style.display = 'none';
          }
        });
      fetchScaleSuggestions();
    } else {
      if (warningDiv) warningDiv.style.display = 'none';
      fetchScaleSuggestions();
    }

    if (matchedBhajan) {
      // 1. Auto-fill visible inputs
      const genderSelect = document.getElementById('gender');
      const gender = genderSelect ? genderSelect.value : '';
      const scaleSelection = scaleForGender(matchedBhajan, gender);
      document.getElementById('scaleInput').value = scaleSelection.scale;
      document.getElementById('speedInput').value = cleanValue(matchedBhajan.tempo);
      
      // 2. Auto-fill other inputs to send to database
      document.getElementById('ragaInput').value = cleanValue(matchedBhajan.raga);
      document.getElementById('hiddenLevel').value = matchedBhajan.level || '';
      document.getElementById('hiddenLanguage').value = matchedBhajan.language || '';
      
      // 3. Show a nice green success message to the singer
      const badge = document.getElementById('masterDataBadge');
      let badgeText = "";
      const cleanRaag = cleanValue(matchedBhajan.raga);
      if (cleanRaag !== 'Not specified') badgeText += `(Raag: ${cleanRaag})`;
      if (scaleSelection.usedFallback) {
        badgeText += `${badgeText ? ' ' : ''}(Female shruti: −5 from ${matchedBhajan.shruti})`;
      }
      
      document.getElementById('badgeDetails').textContent = badgeText;
      badge.style.display = 'block';
    } else {
      // If they type a custom bhajan not in the list, hide the badge
      document.getElementById('masterDataBadge').style.display = 'none';
      document.getElementById('speedInput').value = 'Not specified';
      document.getElementById('ragaInput').value = 'Not specified';
      document.getElementById('hiddenLevel').value = '';
      document.getElementById('hiddenLanguage').value = '';
    }
    }, 300);
  });

  titleInput.addEventListener('focus', renderBhajanSuggestions);
  titleInput.addEventListener('blur', () => {
    setTimeout(() => {
      hideBhajanSuggestions();
    }, 150);
  });
  titleInput.addEventListener('keydown', event => {
    const options = Array.from(suggestions?.querySelectorAll('.bhajan-suggestion') || []);
    if (!options.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      activeSuggestionIndex = event.key === 'ArrowDown'
        ? (activeSuggestionIndex + 1) % options.length
        : (activeSuggestionIndex - 1 + options.length) % options.length;
      options.forEach((option, index) => option.classList.toggle('active', index === activeSuggestionIndex));
      titleInput.setAttribute('aria-activedescendant', options[activeSuggestionIndex].id);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeSuggestionIndex >= 0 && options[activeSuggestionIndex]) {
        options[activeSuggestionIndex].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      } else if (options.length > 0) {
        options[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      }
    } else if (event.key === 'Escape') {
      suggestions.classList.remove('show');
      titleInput.setAttribute('aria-expanded', 'false');
    }
  });
  
  // Instantly swap scale if they change gender AFTER picking a bhajan
  document.getElementById('gender')?.addEventListener('change', function(e) {
    const selectedTitle = document.getElementById('bhajanTitleInput').value;
    if (selectedTitle && currentMasterBhajans) {
      const matchedBhajan = currentMasterBhajans.find(b => b.title === selectedTitle);
      if (matchedBhajan) {
        const gender = e.target.value;
        document.getElementById('scaleInput').value = scaleForGender(matchedBhajan, gender).scale;
      }
    }
    fetchScaleSuggestions();
  });

  // POPUP LOGIC & Form validation
  const preSubmitBtn = document.getElementById('preSubmitBtn');
  const confirmSubmitModal = document.getElementById('confirmSubmitModal');
  const editBtn = document.getElementById('editBtn');
  const confirmBtn = document.getElementById('confirmBtn');
  const form = document.getElementById('bhajanForm');

  if (preSubmitBtn) {
    preSubmitBtn.addEventListener('click', function() {
      // Check standard HTML5 validation
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (!document.getElementById('selectedDeity').value) {
        alert('⚠️ Please select a deity first');
        return;
      }

      // Check if bhajan was explicitly selected from the dropdown
      const masterIdInput = document.getElementById('selectedMasterBhajanId');
      if (!masterIdInput || !masterIdInput.value) {
        openSelectBhajanModal();
        return;
      }

      // Populate Modal
      const singer = document.getElementById('singerName').value;
      const partner = document.getElementById('partnerName').value;
      document.getElementById('modSinger').textContent = singer + (partner ? ` (& ${partner})` : '');
      
      document.getElementById('modDeity').textContent = document.getElementById('selectedDeity').value;
      document.getElementById('modTitle').textContent = document.getElementById('bhajanTitleInput').value;
      document.getElementById('modScale').textContent = document.getElementById('scaleInput').value || 'Not specified';

      // Show Modal
      confirmSubmitModal.classList.add('show');
    });
  }

  if (editBtn) {
    editBtn.addEventListener('click', closeConfirmModal);
  }

  if (confirmBtn) {
    confirmBtn.addEventListener('click', function() {
      if (!isAdmin) {
        const name = document.querySelector('input[name="singer_name"]').value;
        const gender = document.querySelector('select[name="gender"]').value;
        localStorage.setItem('bj_singer_name', name);
        localStorage.setItem('bj_gender', gender);
      }
      form.submit();
    });
  }

  if (form) {
    form.addEventListener('submit', function(e) {
      const masterIdInput = document.getElementById('selectedMasterBhajanId');
      if (!masterIdInput || !masterIdInput.value) {
        e.preventDefault();
        openSelectBhajanModal();
        return;
      }
      // If the modal isn't open yet, prevent native submit and trigger the pre-submit flow
      if (confirmSubmitModal && !confirmSubmitModal.classList.contains('show')) {
        e.preventDefault();
        if (preSubmitBtn) preSubmitBtn.click();
      }
    });
  }

  const closeSelectBhajanBtn = document.getElementById('closeSelectBhajanModalBtn');
  if (closeSelectBhajanBtn) {
    closeSelectBhajanBtn.addEventListener('click', closeSelectBhajanModal);
  }

  window.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      const selectModal = document.getElementById('selectBhajanModal');
      if (selectModal && selectModal.classList.contains('show')) {
        closeSelectBhajanModal();
      }
    }
  });
});

let filterTableTimeout;
function filterTable() {
  clearTimeout(filterTableTimeout);
  filterTableTimeout = setTimeout(() => {
    const inputs = document.querySelectorAll('#dbTable .filter-input');
    const table = document.getElementById("dbTable");
    if (!table) return;
    const tr = table.getElementsByTagName("tr");

    // Start from 2 because row 0 is inputs, row 1 is headers
    for (let i = 2; i < tr.length; i++) {
      let rowVisible = true;
      for (let j = 0; j < inputs.length; j++) {
        const filter = inputs[j].value.toUpperCase();
        const td = tr[i].getElementsByTagName("td")[j];
        if (td) {
          const txtValue = td.textContent || td.innerText;
          if (txtValue.toUpperCase().indexOf(filter) === -1) {
            rowVisible = false;
            break;
          }
        }
      }
      tr[i].style.display = rowVisible ? "" : "none";
    }
  }, 250);
}

let filterMasterBankTimeout;
function filterMasterBank(immediate = false) {
  clearTimeout(filterMasterBankTimeout);
  const doFilter = () => {
    const titleFilter = (document.getElementById('filterBankTitle')?.value || '').toUpperCase();
    const deityFilter = (document.getElementById('filterBankDeity')?.value || '').toUpperCase();
    const tempoFilter = (document.getElementById('filterBankTempo')?.value || '').toUpperCase();
    const ragaFilter = (document.getElementById('filterBankRaga')?.value || '').toUpperCase();
    
    const table = document.getElementById('masterBankTable');
    if (!table) return;
    const tr = table.getElementsByTagName('tr');
    
    for (let i = 1; i < tr.length; i++) { // Skip header
      const tds = tr[i].getElementsByTagName('td');
      if (tds.length > 3) {
        const txtTitle = (tds[0].textContent || tds[0].innerText).toUpperCase();
        const txtDeity = (tds[1].textContent || tds[1].innerText).toUpperCase();
        const txtTempo = (tds[2].textContent || tds[2].innerText).toUpperCase();
        const txtRaga = (tds[3].textContent || tds[3].innerText).toUpperCase();
        
        const matchTitle = txtTitle.indexOf(titleFilter) > -1;
        const matchDeity = deityFilter === "" || txtDeity === deityFilter;
        const matchTempo = tempoFilter === "" || txtTempo === tempoFilter;
        const matchRaga = ragaFilter === "" || txtRaga === ragaFilter;
        
        tr[i].style.display = (matchTitle && matchDeity && matchTempo && matchRaga) ? "" : "none";
      }
    }
  };

  if (immediate) {
    doFilter();
  } else {
    filterMasterBankTimeout = setTimeout(doFilter, 250);
  }
}

// Admin Calendar Modal Logic
let currentAdminDate = null;

function openAdminDateModal(date, type, description) {
  currentAdminDate = date;
  document.getElementById('adminModalDate').textContent = 'Manage ' + date;
  document.getElementById('permDescription').value = description || '';
  document.getElementById('adminDateModal').classList.add('show');
}

function closeAdminModal() {
  document.getElementById('adminDateModal').classList.remove('show');
}

function viewAdminDate() {
  if(currentAdminDate) window.location.href = '/admin/date/' + currentAdminDate;
}

function updatePermission(type) {
  if(!currentAdminDate) return;
  
  const description = document.getElementById('permDescription').value.trim();

  if (type !== 'clear' && !description) {
    alert('⚠️ Description is mandatory for Special/Festival sessions.');
    return;
  }

  fetch('/admin/permission', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: currentAdminDate, type: type, description: description })
  })
  .then(res => {
    if (res.status === 401) {
      alert('Your admin session has expired. Please log in again.');
      window.location.href = '/admin-login';
      return null;
    }
    return res.json();
  })
  .then(data => {
    if (!data) return;
    if (data.success) {
      location.reload();
    } else {
      alert(data.error || 'Error updating permission');
    }
  })
  .catch(err => {
    alert('Network error updating permission: ' + err.message);
  });
}

// Missing Bhajan Catcher Modals
function openMissingBhajanModal(title) {
  document.getElementById('mbTitle').value = title;
  document.getElementById('mbDeity').value = 'Sai';
  document.getElementById('mbTempo').value = 'Medium';
  document.getElementById('mbRaga').value = '';
  document.getElementById('mbShruti').value = '';
  document.getElementById('mbShrutiFemale').value = '';
  document.getElementById('mbLevel').value = '';
  document.getElementById('missingBhajanModal').classList.add('show');
}
function closeMissingBhajanModal() {
  document.getElementById('missingBhajanModal').classList.remove('show');
}

function reconcileBhajan(submittedTitle, action, masterBhajanId) {
  if (action === 'link' && !confirm(`Link all historical submissions of:\n\n"${submittedTitle}"\n\n...to the master bhajan? This will update all matching session records.`)) return;

  fetch('/api/admin/reconcile-bhajan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submitted_title: submittedTitle, action, master_bhajan_id: masterBhajanId })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      if (action === 'link') {
        alert(`✅ Done! Updated ${data.updatedCount} session record(s) to use master title:\n"${data.masterTitle}"`);
        // Hide this reconcile card
        const cardId = 'card-' + encodeURIComponent(submittedTitle);
        const card = document.getElementById(cardId);
        if (card) card.remove();
      }
    } else {
      alert('Error: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(err => alert('Request failed: ' + err.message));
}
function saveMissingBhajan() {
  const data = {
    title: document.getElementById('mbTitle').value,
    deity: document.getElementById('mbDeity').value,
    tempo: document.getElementById('mbTempo').value,
    raga: document.getElementById('mbRaga').value,
    shruti: document.getElementById('mbShruti').value,
    shruti_female: document.getElementById('mbShrutiFemale').value,
    level: document.getElementById('mbLevel').value
  };
  fetch('/api/add-master-bhajan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  .then(res => res.json())
  .then(result => {
    if (result.success) { alert('✅ Successfully added to Master Database!'); location.reload(); }
    else { alert('Error adding to Master DB: ' + result.error); }
  });
}

// Deity Rules Management
function saveDeityRules() {
  const table = document.getElementById('rulesTable');
  const date = document.getElementById('ruleDate').value;
  if (!table) return;
  
  const rules = [];
  const trs = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
  
  for(let tr of trs) {
    const deity = tr.querySelector('.rule-deity').value;
    const min = parseInt(tr.querySelector('.rule-min').value, 10);
    const max = parseInt(tr.querySelector('.rule-max').value, 10);
    rules.push({ deity_name: deity, min_required: min, max_allowed: max });
  }
  
  fetch('/admin/update-rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules, date })
  })
  .then(res => res.json())
  .then(data => {
    if(data.success) { alert('✅ ' + data.message); window.location.href = date === 'default' ? '/admin' : '/admin/date/' + date; }
    else { alert('Error: ' + data.error); }
  });
}

function getWesternScale(indianScale) {
  if (!indianScale || indianScale === '-' || indianScale === 'Not specified') return '-';
  const match = indianScale.toString().trim().match(/^([\d\.]+)\s*([PMpm])?.*$/);
  if (!match) return '-';
  const numMap = {'1':0, '1.5':1, '2':2, '2.5':3, '3':4, '4':5, '4.5':6, '5':7, '5.5':8, '6':9, '6.5':10, '7':11};
  if (numMap[match[1]] === undefined) return '-';
  let index = numMap[match[1]];
  if ((match[2] || '').toUpperCase() === 'M') index = (index + 5) % 12;
  return ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"][index];
}

// Master Bhajan Inline Edit
function editMasterRow(id) {
  const row = document.getElementById(`row-${id}`);
  if (!row) return;
  const cells = row.querySelectorAll('.edit-cell');
  
  cells.forEach(cell => {
    const rawVal = cell.textContent || '';
    const currentValue = rawVal.trim() === '-' ? '' : rawVal.trim();
    const fieldName = cell.getAttribute('data-field');
    const safeValue = currentValue.replace(/"/g, '&quot;');
    cell.innerHTML = `<input type="text" id="input-${id}-${fieldName}" value="${safeValue}" class="filter-input" style="width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 13px;">`;
  });

  const actionCell = row.querySelector('.action-cell');
  if (actionCell) {
    actionCell.innerHTML = `<button class="button" style="padding:6px 12px; font-size:12px; background:#28a745; border:none;" onclick="saveMasterRow(${id})">💾 Save</button>`;
  }
}

function saveMasterRow(id) {
  const updatedData = {
    title: document.getElementById(`input-${id}-title`)?.value.trim() || '',
    deity: document.getElementById(`input-${id}-deity`)?.value.trim() || '',
    tempo: document.getElementById(`input-${id}-tempo`)?.value.trim() || '',
    raga: document.getElementById(`input-${id}-raga`)?.value.trim() || '',
    shruti: document.getElementById(`input-${id}-shruti`)?.value.trim() || '',
    shruti_female: document.getElementById(`input-${id}-shruti_female`)?.value.trim() || '',
    level: document.getElementById(`input-${id}-level`)?.value.trim() || ''
  };

  fetch(`/api/admin/update-master-bhajan/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedData)
  })
  .then(res => res.json())
  .then(response => {
    if(response.success) {
      const row = document.getElementById(`row-${id}`);
      if (row) {
        row.setAttribute('data-deity', (updatedData.deity || '').toLowerCase());
        const cells = row.querySelectorAll('.edit-cell');
        cells.forEach(cell => {
          const fieldName = cell.getAttribute('data-field');
          const val = updatedData[fieldName] || '-';
          if (fieldName === 'deity') {
            cell.innerHTML = `<span class="deity-pill">${escapeHTML ? escapeHTML(val) : val}</span>`;
          } else {
            cell.textContent = val;
          }
        });
      }
      
      // Update western scale display dynamically
      const westM = document.getElementById(`west-m-${id}`);
      const westF = document.getElementById(`west-f-${id}`);
      if (westM) westM.textContent = getWesternScale(updatedData.shruti);
      if (westF) westF.textContent = getWesternScale(updatedData.shruti_female);

      const actionCell = row.querySelector('.action-cell');
      if (actionCell) {
        actionCell.innerHTML = `<button class="button" style="padding:6px 12px; font-size:12px; background:#4dabf7; border:none; margin-right:4px;" onclick="editMasterRow(${id})">✏️ Edit</button><button class="button" style="padding:6px 12px; font-size:12px; background:#e03131; border:none;" onclick="deleteMasterRow(${id})">❌ Del</button>`;
      }
    } else {
      alert('Error: ' + response.error);
    }
  })
  .catch(err => { alert('Failed to save changes.'); console.error(err); });
}

function deleteMasterRow(id) {
  if (!confirm('🚨 Are you sure you want to permanently delete this bhajan from the Master Database?')) return;
  fetch(`/api/admin/delete-master-bhajan/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(res => res.json())
  .then(response => {
    if(response.success) {
      const row = document.getElementById(`row-${id}`);
      if (row) row.remove();
    } else {
      alert('Error: ' + response.error);
    }
  })
  .catch(err => { alert('Failed to delete.'); console.error(err); });
}

function sortTable(n, tableId) {
  const table = document.getElementById(tableId);
  if (!table) return;
  // Target the tbody to avoid sorting table headers
  const tbody = table.getElementsByTagName("TBODY")[0] || table;
  let rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
  switching = true;
  dir = "asc"; 
  
  while (switching) {
    switching = false;
    rows = tbody.getElementsByTagName("TR");
    
    for (i = 0; i < (rows.length - 1); i++) {
      shouldSwitch = false;
      x = rows[i].getElementsByTagName("TD")[n];
      y = rows[i + 1].getElementsByTagName("TD")[n];
      if (!x || !y) continue;

      // Use data-sort attribute if present (for accurate Date sorting), else text
      let valX = x.getAttribute("data-sort") || x.innerHTML.replace(/(<([^>]+)>)/gi, "").trim();
      let valY = y.getAttribute("data-sort") || y.innerHTML.replace(/(<([^>]+)>)/gi, "").trim();

      valX = valX.toLowerCase();
      valY = valY.toLowerCase();

      if (dir === "asc") {
        if (valX > valY) {
          shouldSwitch = true;
          break;
        }
      } else if (dir === "desc") {
        if (valX < valY) {
          shouldSwitch = true;
          break;
        }
      }
    }
    if (shouldSwitch) {
      rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
      switching = true;
      switchcount++;      
    } else {
      if (switchcount === 0 && dir === "asc") {
        dir = "desc";
        switching = true;
      }
    }
  }
}

// ==========================================
// Drag & Drop Sequence Reordering
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const sortableBody = document.getElementById('sortable-body');
  if (!sortableBody) return;

  let draggedRow = null;

  function updateRowIndexNumbers() {
    const rows = sortableBody.querySelectorAll('tr[data-id]');
    rows.forEach((row, index) => {
      const numEl = row.querySelector('.row-num');
      if (numEl) numEl.textContent = index + 1;
    });
  }

  sortableBody.addEventListener('dragstart', (e) => {
    draggedRow = e.target.closest('tr');
    if (!draggedRow) return;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => draggedRow.style.opacity = '0.5', 0);
  });

  sortableBody.addEventListener('dragover', (e) => {
    e.preventDefault();
    const targetRow = e.target.closest('tr');
    if (targetRow && targetRow !== draggedRow && targetRow.parentNode === sortableBody) {
      const rect = targetRow.getBoundingClientRect();
      const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
      sortableBody.insertBefore(draggedRow, next ? targetRow.nextSibling : targetRow);
      updateRowIndexNumbers();
      const saveBtn = document.getElementById('saveOrderBtn');
      if (saveBtn) saveBtn.style.display = 'inline-block';
    }
  });

  sortableBody.addEventListener('dragend', () => {
    if (draggedRow) draggedRow.style.opacity = '1';
    updateRowIndexNumbers();
  });

  // Touch drag-and-drop support for mobile touch screens
  let touchRow = null;

  sortableBody.addEventListener('touchstart', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    touchRow = e.target.closest('tr');
    if (!touchRow) return;
    touchRow.style.opacity = '0.6';
    touchRow.style.background = 'var(--success-bg)';
  }, { passive: true });

  sortableBody.addEventListener('touchmove', (e) => {
    if (!touchRow) return;
    const currentY = e.touches[0].clientY;
    const elementUnderTouch = document.elementFromPoint(e.touches[0].clientX, currentY);
    if (!elementUnderTouch) return;
    const targetRow = elementUnderTouch.closest('#sortable-body tr[data-id]');
    if (targetRow && targetRow !== touchRow) {
      const rect = targetRow.getBoundingClientRect();
      const next = (currentY - rect.top) / (rect.bottom - rect.top) > 0.5;
      sortableBody.insertBefore(touchRow, next ? targetRow.nextSibling : targetRow);
      updateRowIndexNumbers();
      const saveBtn = document.getElementById('saveOrderBtn');
      if (saveBtn) saveBtn.style.display = 'inline-block';
    }
  }, { passive: true });

  sortableBody.addEventListener('touchend', () => {
    if (touchRow) {
      touchRow.style.opacity = '1';
      touchRow.style.background = '';
      touchRow = null;
      updateRowIndexNumbers();
    }
  });
});

function saveReorderSequence() {
  const rows = document.querySelectorAll('#sortable-body tr[data-id]');
  const orderData = Array.from(rows).map((row, index) => ({
    id: parseInt(row.getAttribute('data-id')),
    order: index + 1
  }));
  
  fetch('/api/admin/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderData })
  }).then(res => res.json()).then(data => {
    if(data.success) location.reload();
    else alert('Error saving sequence');
  });
}

function toggleSessionLock(date, isLocked) {
  fetch('/api/admin/toggle-lock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, is_locked: isLocked })
  }).then(res => res.json()).then(data => {
    if(data.success) location.reload();
  });
}

// ==========================================
// Edit Singer Dictionary
// ==========================================
function editSinger(id, currentName) {
  const newName = prompt("Edit Singer Name:", currentName);
  if (newName === null || newName.trim() === "") return;
  document.getElementById('edit-input-' + id).value = newName.trim();

  const currentGender = document.getElementById('edit-gender-' + id)?.value || '';
  const newGender = prompt("Set gender (Male, Female, or Other):", currentGender);
  if (newGender === null) return;
  if (!['Male', 'Female', 'Other'].includes(newGender.trim())) {
    alert('Please enter Male, Female, or Other.');
    return;
  }
  document.getElementById('edit-gender-' + id).value = newGender.trim();
  document.getElementById('edit-form-' + id).submit();
}

// Chrome can otherwise restore a stale form from its back/forward cache.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});
function openCopySessionModal() {
  document.getElementById('copySessionModal').classList.add('show');
}
function closeCopySessionModal() {
  document.getElementById('copySessionModal').classList.remove('show');
}
function submitCopySession() {
  const source_date = document.getElementById('copySourceDate').value;
  const target_date = document.getElementById('copyTargetDate').value;
  if (!source_date || !target_date) {
    alert('⚠️ Please choose both dates.');
    return;
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = '/admin/copy-session';
  [['source_date', source_date], ['target_date', target_date]].forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

// Real-time Activity & Presence Heartbeat
(function() {
  let pageStartTime = Date.now();
  function sendHeartbeat() {
    const elapsedSeconds = Math.round((Date.now() - pageStartTime) / 1000);
    pageStartTime = Date.now();
    fetch('/api/activity/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: window.location.pathname + window.location.search, duration: elapsedSeconds })
    }).catch(function() {});
  }

  function sendOfflineBeacon() {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/activity/offline');
    } else {
      fetch('/api/activity/offline', { method: 'POST', keepalive: true }).catch(function() {});
    }
  }

  setInterval(sendHeartbeat, 8000);
  window.addEventListener('pagehide', sendOfflineBeacon);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      sendOfflineBeacon();
    }
  });
})();

// Searchable Dropdowns for Master Bhajan Bank Filters
// Using position:fixed + getBoundingClientRect so the dropdown escapes
// ALL parent overflow:hidden, flex clipping, and body overflow-x:hidden.
function positionDropdown(menu, btn) {
  const rect = btn.getBoundingClientRect();
  const menuW = parseInt(menu.style.width) || 220;
  const viewportW = window.innerWidth;

  // Default: align left edge with button
  let left = rect.left;

  // If dropdown overflows right edge, align right edge with button's right
  if (left + menuW > viewportW - 8) {
    left = rect.right - menuW;
  }
  // Clamp to viewport left
  if (left < 8) left = 8;

  menu.style.position = 'fixed';
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.left = left + 'px';
  menu.style.width = Math.min(menuW, viewportW - 16) + 'px';
}

function toggleSearchDropdown(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const menu = container.querySelector('.dd-menu');
  const btn  = container.querySelector('.dd-toggle');
  const isOpening = menu.style.display === 'none' || menu.style.display === '';

  // Close all dropdowns first
  document.querySelectorAll('.dd-menu').forEach(m => m.style.display = 'none');

  if (isOpening) {
    menu.style.display = 'block';
    positionDropdown(menu, btn);
    const searchInput = menu.querySelector('.dd-search');
    if (searchInput) {
      searchInput.value = '';
      filterDropdownOptions(containerId);
      setTimeout(() => searchInput.focus(), 50);
    }
  }
}

// Reposition open dropdown on scroll or resize
['scroll', 'resize'].forEach(evt => {
  window.addEventListener(evt, () => {
    document.querySelectorAll('.dd-menu').forEach(menu => {
      if (menu.style.display === 'block') {
        const containerId = menu.closest('.searchable-dropdown')?.id;
        if (!containerId) return;
        const container = document.getElementById(containerId);
        const btn = container?.querySelector('.dd-toggle');
        if (btn) positionDropdown(menu, btn);
      }
    });
  }, { passive: true });
});

function filterDropdownOptions(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const searchInput = container.querySelector('.dd-search');
  const filterText = (searchInput?.value || '').toLowerCase().trim();
  const options = container.querySelectorAll('.dd-option');

  options.forEach(opt => {
    const text = opt.textContent.toLowerCase();
    opt.style.display = text.includes(filterText) ? 'block' : 'none';
  });
}

function selectDropdownOption(containerId, val, label) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let hiddenInputId = 'filterBankDeity';
  if (containerId === 'dd-tempo') hiddenInputId = 'filterBankTempo';
  if (containerId === 'dd-raga') hiddenInputId = 'filterBankRaga';

  const hiddenInput = document.getElementById(hiddenInputId);
  if (hiddenInput) {
    hiddenInput.value = val;
    hiddenInput.dispatchEvent(new Event('change'));
  }

  const labelEl = container.querySelector('.dd-label');
  if (labelEl) labelEl.textContent = label;

  const menu = container.querySelector('.dd-menu');
  if (menu) menu.style.display = 'none';

  filterMasterBank();
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.searchable-dropdown')) {
    document.querySelectorAll('.dd-menu').forEach(m => m.style.display = 'none');
  }
});
