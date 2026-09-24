(function attachVectonProfileDialogModule(window) {
  function createProfileDialogModule(deps) {
    const {
      state,
      profileDialog,
      profileForm,
      profilePhotoFile,
      profilePhotoTrigger,
      getEditableProfile,
      setProfileDraft,
      updateProfileDraftFromForm,
      applyPhotoPreview,
      readFileAsDataUrl,
      persistAndRender,
      syncUserProfile,
      renderAccessTrees
    } = deps;

    const appearance = window.VECTON_APPEARANCE;
    const appearanceControl = document.querySelector('#profile-appearance');
    const appearanceError = document.querySelector('#appearance-error');

    function bindProfileEvents() {
      if (!profileForm) {
        return;
      }

      profileForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (appearance && appearanceControl && !appearance.save(appearanceControl.checked ? 'clear' : 'dark')) {
          if (appearanceError) {
            appearanceError.textContent = 'Não foi possível salvar a aparência neste navegador. Tente novamente.';
            appearanceError.hidden = false;
          }
          return;
        }
        const formData = new FormData(profileForm);
        const draft = getEditableProfile();
        state.profile = {
          name: String(formData.get("name") || "").trim(),
          email: String(formData.get("email") || "").trim(),
          phone: String(formData.get("phone") || "").trim(),
          photoKind: draft.photoKind || "none",
          photoValue: draft.photoValue || "",
          department: String(formData.get("department") || "").trim(),
          role: draft.role || "Administrador"
        };
        setProfileDraft({ ...state.profile });
        persistAndRender();
        closeProfileDialog();
        await syncUserProfile();
      });

      appearanceControl?.addEventListener('change', () => {
        if (appearanceError) appearanceError.hidden = true;
        appearance?.preview(appearanceControl.checked ? 'clear' : 'dark');
      });

      profilePhotoTrigger?.addEventListener("click", () => {
        profilePhotoFile?.click();
      });

      profilePhotoFile?.addEventListener("change", async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
          return;
        }

        const dataUrl = await readFileAsDataUrl(file);
        setProfileDraft({
          ...getEditableProfile(),
          photoKind: "upload",
          photoValue: dataUrl
        });
        renderProfileEditor();
      });

      ["#profile-name", "#profile-email", "#profile-department", "#profile-role", "#profile-phone"].forEach((selector) => {
        document.querySelector(selector)?.addEventListener("input", () => {
          updateProfileDraftFromForm();
        });
      });

      document.querySelector("#profile-dialog-close")?.addEventListener("click", closeProfileDialog);
      document.querySelector("#profile-dialog-cancel")?.addEventListener("click", closeProfileDialog);

      profileDialog?.addEventListener("click", (event) => {
        if (event.target === profileDialog) {
          closeProfileDialog();
        }
      });

      profileDialog?.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeProfileDialog();
      });
    }

    function renderProfileEditor() {
      if (!profileForm) {
        return;
      }

      const editableProfile = getEditableProfile();
      document.querySelector("#profile-name").value = editableProfile.name;
      document.querySelector("#profile-email").value = editableProfile.email;
      if (document.querySelector("#profile-phone")) {
        document.querySelector("#profile-phone").value = editableProfile.phone || "";
      }
      document.querySelector("#profile-department").value = editableProfile.department;
      document.querySelector("#profile-role").value = editableProfile.role;
      document.querySelector("#profile-preview-name").textContent = editableProfile.name || "Usuario";
      document.querySelector("#profile-preview-role").textContent = editableProfile.role || "Administrador";
      applyPhotoPreview(profilePhotoTrigger, editableProfile.photoKind, editableProfile.photoValue, editableProfile.name);
    }

    function openProfileDialog() {
      if (!profileDialog) return;
      if (appearanceControl) appearanceControl.checked = appearance?.get() === 'clear';
      if (appearanceError) appearanceError.hidden = true;
      renderProfileEditor();
      renderAccessTrees();
      profileDialog.showModal();
      document.body.classList.add("dialog-open");
    }

    function closeProfileDialog() {
      if (!profileDialog) return;
      appearance?.restore();
      profileDialog.close();
      document.body.classList.remove("dialog-open");
      setProfileDraft(null);
    }

    return {
      bindProfileEvents,
      renderProfileEditor,
      openProfileDialog,
      closeProfileDialog
    };
  }

  window.VECTON_PROFILE_DIALOG = {
    createProfileDialogModule
  };
})(window);
